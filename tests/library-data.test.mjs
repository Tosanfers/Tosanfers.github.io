import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { resolveBooks, resolveLibraryFolders, resolveLibraryStats } = await jiti.import(
	"../src/utils/library.ts",
);
const { bookOverrides } = await jiti.import("../src/data/books.ts");

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
	const localFiles = findBookFiles(booksRoot);
	const hiddenFiles = new Set(
		bookOverrides
			.filter((definition) => definition.hidden)
			.map((definition) => decodeURIComponent(definition.file)),
	);
	const expectedCount =
		localFiles.length > 0
			? localFiles.filter(
					(file) =>
						!hiddenFiles.has(
							`/${path.relative(publicRoot, file).replaceAll(path.sep, "/")}`,
						),
				).length
			: releaseManifest.books.filter((entry) => !hiddenFiles.has(entry.file)).length;

	assert.equal(books.length, expectedCount);
	assert.equal(new Set(books.map((book) => book.id)).size, books.length);
	assert.equal(new Set(books.map((book) => book.fileUrl)).size, books.length);
	assert.ok(books.every((book) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(book.id)));
	assert.ok(books.every((book) => book.detailUrl === `/library/${book.id}/`));
	assert.ok(books.every((book) => book.fileSize > 0));
	assert.ok(books.every((book) => typeof book.personalReview === "string"));
	assert.ok(
		books.every(
			(book) => book.folderPath === book.folderSegments.join("/"),
		),
	);
	if (localFiles.length > 0) {
		assert.ok(
			books.every((book) => {
				const file = path.join(
					publicRoot,
					...decodeURIComponent(book.fileUrl).slice(1).split("/"),
				);
				return fs.existsSync(file);
			}),
		);
	} else {
		assert.ok(books.every((book) => book.fileUrl.startsWith("https://github.com/")));
	}
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

test("release manifest covers every visible book with valid remote metadata", () => {
	const books = resolveBooks();
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
