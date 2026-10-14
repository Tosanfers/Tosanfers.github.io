import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { resolveBooks, resolveLibraryFolders, resolveLibraryStats, resolveNetworkBooks } =
	await jiti.import("../src/utils/library.ts");
const { groupBooksBySeries } = await jiti.import("../src/utils/library-series.ts");
const { bookOverrides, networkBooks } = await jiti.import("../src/data/books.ts");

const publicRoot = path.resolve("public");
const booksRoot = path.join(publicRoot, "books");
const releaseManifest = JSON.parse(
	fs.readFileSync("src/data/library.generated.json", "utf8"),
);

function findBookFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) return findBookFiles(absolute);
		return entry.isFile() && /\.(?:txt|epub)$/i.test(entry.name) ? [absolute] : [];
	});
}

test("resolves every TXT and EPUB from local files or the release manifest", () => {
	const books = resolveBooks();
	const localBooks = books.filter((book) => book.source === "local");
	const localFiles = findBookFiles(booksRoot);
	const hiddenFiles = new Set(
		bookOverrides
			.filter((definition) => definition.hidden)
			.map((definition) => decodeURIComponent(definition.file)),
	);
	const expectedFiles = new Set([
		...releaseManifest.books.map((entry) => entry.file),
		...localFiles.map(
			(file) => `/${path.relative(publicRoot, file).replaceAll(path.sep, "/")}`,
		),
	]);
	for (const hiddenFile of hiddenFiles) expectedFiles.delete(hiddenFile);
	const expectedCount = expectedFiles.size;

	assert.equal(localBooks.length, expectedCount);
	assert.equal(
		books.length,
		expectedCount + networkBooks.filter((definition) => !definition.hidden).length,
	);
	assert.equal(new Set(books.map((book) => book.id)).size, books.length);
	assert.equal(new Set(books.map((book) => book.fileUrl)).size, books.length);
	assert.ok(books.every((book) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id)));
	assert.ok(books.every((book) => book.detailUrl === `/library/${book.id}/`));
	assert.ok(localBooks.every((book) => book.fileSize > 0));
	assert.ok(books.every((book) => book.source === "local" || book.source === "network"));
	assert.ok(books.every((book) => typeof book.personalReview === "string"));
	assert.ok(
		books.every(
			(book) => book.folderPath === book.folderSegments.join("/"),
		),
	);
	assert.ok(
		localBooks.every((book) => {
			if (book.fileUrl.startsWith("/books/")) {
				const file = path.join(
					publicRoot,
					...decodeURIComponent(book.fileUrl).slice(1).split("/"),
				);
				return fs.existsSync(file);
			}
			return book.fileUrl.startsWith("https://github.com/");
		}),
	);
});

test("builds nested folder counts from visible books", () => {
	const books = resolveBooks();
	const folders = resolveLibraryFolders(books);

	assert.equal(new Set(folders.map((folder) => folder.path)).size, folders.length);
	for (const folder of folders) {
		const descendants = books.filter(
			(book) =>
				book.folderPath === folder.path ||
				book.folderPath.startsWith(`${folder.path}/`),
		);
		const directBooks = books.filter((book) => book.folderPath === folder.path);
		assert.equal(folder.totalCount, descendants.length);
		assert.equal(folder.directCount, directBooks.length);
		assert.ok(folder.totalCount >= folder.directCount);
	}
	assert.ok(folders.some((folder) => folder.parentPath));
});

test("groups directory-based series and sorts numbered volumes", () => {
	const groups = groupBooksBySeries(resolveBooks());
	const standalone = groups.find((group) => !group.series);
	const mushoku = groups.find(
		(group) => group.series === "无职转生 ～到了异世界就拿出真本事",
	);
	const spider = groups.find((group) => group.series === "转生成蜘蛛又怎样！");

	assert.equal(
		standalone?.books.length,
		resolveBooks().filter((book) => !book.series).length,
	);
	assert.equal(groups.at(-1), standalone);
	assert.equal(mushoku?.books.length, 18);
	assert.deepEqual(
		mushoku?.books.map((book) => book.volume),
		[1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
	);
	assert.equal(spider?.books.length, 17);
	assert.deepEqual(
		spider?.books.map((book) => book.volume),
		[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, undefined],
	);
});

test("release manifest covers every visible book with valid remote metadata", () => {
	const books = resolveBooks().filter((book) => book.source === "local");
	const entries = releaseManifest.books;

	assert.equal(releaseManifest.version, 1);
	assert.equal(entries.length, books.length);
	assert.equal(new Set(entries.map((entry) => entry.file)).size, entries.length);
	assert.equal(new Set(entries.map((entry) => entry.assetName)).size, entries.length);
	assert.ok(entries.every((entry) => entry.fileSize > 0));
	assert.ok(entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
	assert.ok(
		entries.every((entry) =>
			entry.downloadUrl.startsWith(
				"https://github.com/Tosanfers/Tosanfers.github.io/releases/download/library-v1/",
			),
		),
	);
});

test("resolves declared network books without fetching remote metadata", () => {
	const definitions = [
		{
			url: "https://example.com/library/series-02.epub?download=1",
			title: "网络系列第二卷",
			series: "网络系列",
			volume: 2,
			added: "2026-10-13",
			fileSize: 2048,
		},
		{
			url: "https://example.com/download?id=book",
			title: "无扩展名 TXT",
			format: "TXT",
			added: "2026-10-12",
		},
	];
	const books = resolveNetworkBooks(definitions);

	assert.equal(books.length, 2);
	assert.equal(books[0].source, "network");
	assert.equal(books[0].format, "EPUB");
	assert.equal(books[0].series, "网络系列");
	assert.equal(books[0].volume, 2);
	assert.equal(books[0].fileSizeLabel, "2.0 KB");
	assert.equal(books[1].format, "TXT");
	assert.equal(books[1].fileSize, undefined);
	assert.match(books[1].fileUrl, /^https:\/\/example\.com\//);
	const combinedBooks = resolveBooks({ networkDefinitions: definitions });
	assert.equal(combinedBooks.filter((book) => book.source === "network").length, 2);
	assert.equal(combinedBooks.length, resolveBooks({ includeNetwork: false }).length + 2);

	assert.throws(
		() =>
			resolveNetworkBooks([
				{
					url: "http://example.com/book.epub",
					title: "不安全链接",
					added: "2026-10-13",
				},
			]),
		/HTTPS URL/,
	);
	assert.throws(
		() =>
			resolveNetworkBooks([
				{
					url: "https://example.com/download?id=book",
					title: "缺少格式",
					added: "2026-10-13",
				},
			]),
		/format is required/,
	);
});

test("computes library statistics from resolved books", () => {
	const books = resolveBooks();
	const stats = resolveLibraryStats(books);

	assert.equal(stats.total, books.length);
	assert.equal(
		stats.finished,
		books.filter((book) => book.readingStatus === "finished").length,
	);
	assert.equal(
		stats.reading,
		books.filter((book) => book.readingStatus === "reading").length,
	);
	assert.equal(
		stats.epub,
		books.filter((book) => book.format === "EPUB").length,
	);
});

test("infers metadata from a nested source filename", () => {
	const inferred = resolveBooks().find((book) => book.title.includes("成了会自爆的实验体"));

	assert.ok(inferred);
	assert.equal(inferred.format, "TXT");
	assert.equal(inferred.category, "轻小说");
	assert.equal(inferred.status, "completed");
});
