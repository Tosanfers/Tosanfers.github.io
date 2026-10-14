import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	bookOverrides,
	libraryMeta,
	networkBooks,
	type Book,
	type BookDefinition,
	type BookFormat,
	type BookStatus,
	type LibraryFolder,
	type LibraryManifest,
	type LibraryStats,
	type NetworkBookDefinition,
} from "../data/books.ts";

const PROJECT_ROOT = path.resolve(process.env.LIBRARY_PROJECT_ROOT ?? process.cwd());
const BOOKS_ROOT = path.resolve(
	process.env.LIBRARY_BOOKS_ROOT ?? path.join(PROJECT_ROOT, "public/books"),
);
const MANIFEST_PATH = path.resolve(
	process.env.LIBRARY_MANIFEST_PATH ?? path.join(PROJECT_ROOT, "src/data/library.generated.json"),
);
const ALLOWED_EXTENSIONS = new Set([".txt", ".epub"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

interface BookSource {
	publicFile: string;
	fileSize: number;
	added: string;
	downloadUrl?: string;
}

interface ResolveBooksOptions {
	includeNetwork?: boolean;
	networkDefinitions?: readonly NetworkBookDefinition[];
}

function fail(message: string): never {
	throw new Error(`[library] ${message}`);
}

function toPosix(value: string): string {
	return value.replaceAll(path.sep, "/");
}

function normalizePublicFile(value: string): string {
	const normalized = value.trim().replaceAll("\\", "/");
	if (!normalized.startsWith("/books/")) {
		fail(`file must start with /books/: ${value}`);
	}
	const relative = path.posix.normalize(normalized.slice("/books/".length));
	if (!relative || relative === "." || relative.startsWith("../")) {
		fail(`file escapes public/books: ${value}`);
	}
	return `/books/${relative}`;
}

function toFileSystemPath(publicPath: string): string {
	return path.join(BOOKS_ROOT, ...publicPath.slice("/books/".length).split("/"));
}

function encodePublicPath(publicPath: string): string {
	return publicPath
		.split("/")
		.map((segment, index) => (index === 0 ? "" : encodeURIComponent(segment)))
		.join("/");
}

function discoverFiles(directory: string): string[] {
	if (!fs.existsSync(directory)) return [];
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) return discoverFiles(absolute);
			if (!entry.isFile()) return [];
			const extension = path.extname(entry.name).toLowerCase();
			if (extension === ".epbu") {
				fail(`unsupported .epbu extension (did you mean .epub?): ${absolute}`);
			}
			return ALLOWED_EXTENSIONS.has(extension) ? [absolute] : [];
		})
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function resolveBookSources(): BookSource[] {
	const localFiles = discoverFiles(BOOKS_ROOT);
	const sources = new Map<string, BookSource>();

	if (fs.existsSync(MANIFEST_PATH)) {
		let manifest: LibraryManifest;
		try {
			manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as LibraryManifest;
		} catch (error) {
			fail(`cannot parse ${path.relative(PROJECT_ROOT, MANIFEST_PATH)}: ${String(error)}`);
		}
		if (manifest.version !== 1 || !Array.isArray(manifest.books)) {
			fail("library.generated.json must use manifest version 1");
		}

		const declaredFiles = new Set<string>();
		const declaredAssets = new Set<string>();
		manifest.books.forEach((entry, index) => {
			const file = normalizePublicFile(entry.file);
			if (declaredFiles.has(file)) fail(`duplicate manifest file: ${file}`);
			if (!entry.assetName || declaredAssets.has(entry.assetName)) {
				fail(`duplicate or empty manifest assetName at books[${index}]`);
			}
			if (!ALLOWED_EXTENSIONS.has(path.extname(file).toLowerCase())) {
				fail(`manifest books[${index}].file must be a .txt or .epub file`);
			}
			if (!entry.downloadUrl?.startsWith("https://github.com/")) {
				fail(`manifest books[${index}].downloadUrl must be a GitHub HTTPS URL`);
			}
			if (!Number.isSafeInteger(entry.fileSize) || entry.fileSize <= 0) {
				fail(`manifest books[${index}].fileSize must be a positive integer`);
			}
			if (!isValidDate(entry.added)) {
				fail(`manifest books[${index}].added must be a valid YYYY-MM-DD date`);
			}
			if (!SHA256_PATTERN.test(entry.sha256)) {
				fail(`manifest books[${index}].sha256 must be a lowercase SHA-256 digest`);
			}
			declaredFiles.add(file);
			declaredAssets.add(entry.assetName);
			sources.set(file, {
				publicFile: file,
				fileSize: entry.fileSize,
				added: entry.added,
				downloadUrl: entry.downloadUrl,
			});
		});
	}

	for (const absolute of localFiles) {
		const relative = toPosix(path.relative(BOOKS_ROOT, absolute));
		const publicFile = `/books/${relative}`;
		const stats = fs.statSync(absolute);
		sources.set(publicFile, {
			publicFile,
			fileSize: stats.size,
			added: stats.mtime.toISOString().slice(0, 10),
		});
	}

	return [...sources.values()].sort((a, b) =>
		a.publicFile.localeCompare(b.publicFile, undefined, { numeric: true }),
	);
}

function formatFromPath(filePath: string): BookFormat {
	return path.extname(filePath).toLowerCase() === ".epub" ? "EPUB" : "TXT";
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidDate(value: string): boolean {
	if (!DATE_PATTERN.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

function cleanTitle(filePath: string): string {
	return path
		.basename(filePath, path.extname(filePath))
		.replace(/\s*\((?:z-library|1lib|z-lib)[^)]*\)\s*$/iu, "")
		.replace(/^zh\.[^.]+\./iu, "")
		.replace(/^\[[^\]]+\][._\s-]*/u, "")
		.trim();
}

function inferAuthor(filePath: string): string {
	const base = path.basename(filePath, path.extname(filePath));
	const bracketed = base.match(/^\[([^\]]+)\]/u)?.[1]?.trim();
	if (bracketed) return bracketed;
	const parenthesized = base.match(/\((?:【[^】]+】)?([^()]+)\)(?:\s*\(|\s*$)/u)?.[1]?.trim();
	return parenthesized || libraryMeta.unknownAuthor;
}

function inferCategory(relativePath: string): string {
	const segments = relativePath.split("/");
	if (segments.length < 2) return libraryMeta.uncategorized;
	return segments[0]?.replace(/epub$/iu, "").trim() || libraryMeta.uncategorized;
}

function inferStatus(filePath: string): BookStatus {
	return /完结|完全收录/u.test(filePath) ? "completed" : "unknown";
}

function inferVolume(filePath: string): number | undefined {
	const base = path.basename(filePath, path.extname(filePath)).normalize("NFKC");
	const explicitVolume = base.match(/第\s*(\d+(?:\.\d+)?)\s*卷/iu)?.[1];
	const trailingVolume = base.match(/(?:^|[.\s_-])(\d+(?:\.\d+)?)(?:\s*[卷册])?$/u)?.[1];
	const value = Number(explicitVolume ?? trailingVolume);
	return Number.isFinite(value) ? value : undefined;
}

function resolveSeriesFolders(sources: readonly BookSource[]): ReadonlySet<string> {
	const counts = new Map<string, number>();
	for (const source of sources) {
		const relative = source.publicFile.slice("/books/".length);
		const folderPath = path.posix.dirname(relative);
		if (folderPath === "." || folderPath.split("/").length < 2) continue;
		counts.set(folderPath, (counts.get(folderPath) ?? 0) + 1);
	}
	return new Set([...counts].filter(([, count]) => count > 1).map(([folderPath]) => folderPath));
}

function inferSeries(relativePath: string, seriesFolders: ReadonlySet<string>): string | undefined {
	const folderPath = path.posix.dirname(relativePath);
	if (!seriesFolders.has(folderPath)) return undefined;
	return path.posix.basename(folderPath).trim() || undefined;
}

function stableId(relativePath: string, preferred?: string): string {
	if (preferred) return preferred;
	const basename = path.basename(relativePath, path.extname(relativePath));
	const readable = basename
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
	const hash = crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 10);
	return `${readable || "book"}-${hash}`;
}

function stableNetworkId(title: string, url: string, preferred?: string): string {
	if (preferred) return preferred;
	const readable = title
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 48);
	const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
	return `${readable || "network-book"}-${hash}`;
}

function validateOptionalMetadata(
	definition: Pick<
		BookDefinition,
		"id" | "rating" | "series" | "volume" | "added" | "cover"
	>,
	label: string,
): void {
	if (definition.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
		fail(`${label}.id must use lowercase letters, numbers, and hyphens`);
	}
	if (
		definition.rating !== undefined &&
		(!Number.isFinite(definition.rating) || definition.rating < 0 || definition.rating > 5)
	) {
		fail(`${label}.rating must be between 0 and 5`);
	}
	if (
		definition.series !== undefined &&
		definition.series !== false &&
		!definition.series.trim()
	) {
		fail(`${label}.series must not be empty`);
	}
	if (
		definition.volume !== undefined &&
		(!Number.isFinite(definition.volume) || definition.volume < 0)
	) {
		fail(`${label}.volume must be a non-negative number`);
	}
	if (definition.added && !isValidDate(definition.added)) {
		fail(`${label}.added must be a valid YYYY-MM-DD date`);
	}
	if (definition.cover) {
		const cover = normalizePublicFile(definition.cover);
		const coverPath = toFileSystemPath(cover);
		if (!fs.existsSync(coverPath) || !fs.statSync(coverPath).isFile()) {
			fail(`${label}.cover does not exist: ${cover}`);
		}
	}
}

function validateOverride(
	definition: BookDefinition,
	index: number,
	availableFiles: ReadonlySet<string>,
): string {
	const file = normalizePublicFile(definition.file);
	const extension = path.extname(file).toLowerCase();
	if (!ALLOWED_EXTENSIONS.has(extension)) {
		fail(`bookOverrides[${index}].file must be a .txt or .epub file: ${file}`);
	}
	if (!availableFiles.has(file)) {
		fail(`bookOverrides[${index}].file is not present locally or in the manifest: ${file}`);
	}
	const inferredFormat = formatFromPath(file);
	if (definition.format && definition.format !== inferredFormat) {
		fail(`bookOverrides[${index}].format does not match ${file}`);
	}
	validateOptionalMetadata(definition, `bookOverrides[${index}]`);
	return file;
}

export function resolveNetworkBooks(
	definitions: readonly NetworkBookDefinition[] = networkBooks,
): Book[] {
	const declaredUrls = new Set<string>();
	const declaredIds = new Set<string>();

	return definitions
		.map((definition, index): Book | null => {
			const label = `networkBooks[${index}]`;
			const title = definition.title.trim();
			if (!title) fail(`${label}.title must not be empty`);
			validateOptionalMetadata(definition, label);
			if (!isValidDate(definition.added)) {
				fail(`${label}.added must be a valid YYYY-MM-DD date`);
			}

			let parsedUrl: URL;
			try {
				parsedUrl = new URL(definition.url);
			} catch {
				fail(`${label}.url must be a valid HTTPS URL`);
			}
			if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) {
				fail(`${label}.url must be an HTTPS URL without embedded credentials`);
			}
			const normalizedUrl = parsedUrl.href;
			if (declaredUrls.has(normalizedUrl)) fail(`duplicate network book URL: ${normalizedUrl}`);
			declaredUrls.add(normalizedUrl);

			const extension = path.posix.extname(parsedUrl.pathname).toLowerCase();
			const inferredFormat = ALLOWED_EXTENSIONS.has(extension)
				? formatFromPath(parsedUrl.pathname)
				: undefined;
			if (!definition.format && !inferredFormat) {
				fail(`${label}.format is required when the URL has no .txt or .epub extension`);
			}
			if (definition.format && inferredFormat && definition.format !== inferredFormat) {
				fail(`${label}.format does not match the URL extension`);
			}
			if (
				definition.fileSize !== undefined &&
				(!Number.isSafeInteger(definition.fileSize) || definition.fileSize <= 0)
			) {
				fail(`${label}.fileSize must be a positive integer`);
			}

			const id = stableNetworkId(title, normalizedUrl, definition.id);
			if (declaredIds.has(id)) fail(`duplicate resolved network book id: ${id}`);
			declaredIds.add(id);
			if (definition.hidden) return null;
			const format = definition.format ?? inferredFormat;
			if (!format) fail(`${label}.format could not be resolved`);
			const cover = definition.cover ? normalizePublicFile(definition.cover) : undefined;

			return {
				id,
				title,
				author: definition.author?.trim() || libraryMeta.unknownAuthor,
				series: definition.series?.trim() || undefined,
				volume: definition.volume,
				description:
					definition.description?.trim() ||
					libraryMeta.networkFileDescription
						.replace("{format}", format)
						.replace("{title}", title),
				personalReview: definition.personalReview?.trim() || "",
				coverUrl: cover ? encodePublicPath(cover) : undefined,
				fileUrl: normalizedUrl,
				detailUrl: `/library/${id}/`,
				source: "network",
				folderPath: "",
				folderSegments: [],
				format,
				category: definition.category?.trim() || libraryMeta.networkCategory,
				tags: definition.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
				status: definition.status ?? inferStatus(title),
				readingStatus: definition.readingStatus ?? "unread",
				rating: definition.rating,
				added: definition.added,
				fileSize: definition.fileSize,
				fileSizeLabel:
					definition.fileSize === undefined ? undefined : formatBytes(definition.fileSize),
			};
		})
		.filter((book): book is Book => book !== null);
}

export function resolveBooks({
	includeNetwork = true,
	networkDefinitions = networkBooks,
}: ResolveBooksOptions = {}): Book[] {
	const sources = resolveBookSources();
	const seriesFolders = resolveSeriesFolders(sources);
	const availableFiles = new Set(sources.map((source) => source.publicFile));
	const overrides = new Map<string, BookDefinition>();
	const declaredIds = new Set<string>();
	bookOverrides.forEach((definition, index) => {
		const file = validateOverride(definition, index, availableFiles);
		if (overrides.has(file)) fail(`duplicate override for ${file}`);
		if (definition.id) {
			if (declaredIds.has(definition.id)) fail(`duplicate book id: ${definition.id}`);
			declaredIds.add(definition.id);
		}
		overrides.set(file, definition);
	});

	const resolvedIds = new Set<string>();
	const resolvedBooks = sources
		.map((source): Book | null => {
			const publicFile = source.publicFile;
			const relative = publicFile.slice("/books/".length);
			const override = overrides.get(publicFile);
			if (override?.hidden) return null;
			const format = formatFromPath(relative);
			const title = override?.title?.trim() || cleanTitle(relative);
			const folderPath = path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative);
			const folderSegments = folderPath ? folderPath.split("/") : [];
			const series =
				override?.series === false
					? undefined
					: override?.series?.trim() || inferSeries(relative, seriesFolders);
			const id = stableId(relative, override?.id);
			if (resolvedIds.has(id)) fail(`duplicate resolved book id: ${id}`);
			resolvedIds.add(id);
			const cover = override?.cover ? normalizePublicFile(override.cover) : undefined;
			return {
				id,
				title,
				author: override?.author?.trim() || inferAuthor(relative),
				series,
				volume: override?.volume ?? (series ? inferVolume(relative) : undefined),
				description:
					override?.description?.trim() ||
					libraryMeta.localFileDescription
						.replace("{format}", format)
						.replace("{title}", title),
				personalReview: override?.personalReview?.trim() || "",
				coverUrl: cover ? encodePublicPath(cover) : undefined,
				fileUrl: source.downloadUrl ?? encodePublicPath(publicFile),
				detailUrl: `/library/${id}/`,
				source: "local",
				folderPath,
				folderSegments,
				format,
				category: override?.category?.trim() || inferCategory(relative),
				tags: override?.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
				status: override?.status ?? inferStatus(relative),
				readingStatus: override?.readingStatus ?? "unread",
				rating: override?.rating,
				added: override?.added ?? source.added,
				fileSize: source.fileSize,
				fileSizeLabel: formatBytes(source.fileSize),
			};
		})
		.filter((book): book is Book => book !== null);

	if (includeNetwork) {
		for (const networkBook of resolveNetworkBooks(networkDefinitions)) {
			if (resolvedIds.has(networkBook.id)) {
				fail(`duplicate resolved book id: ${networkBook.id}`);
			}
			resolvedIds.add(networkBook.id);
			resolvedBooks.push(networkBook);
		}
	}

	return resolvedBooks.sort(
		(a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title),
	);
}

export function resolveLibraryFolders(books: readonly Book[]): LibraryFolder[] {
	const folders = new Map<string, LibraryFolder>();

	for (const book of books) {
		book.folderSegments.forEach((name, index) => {
			const segments = book.folderSegments.slice(0, index + 1);
			const folderPath = segments.join("/");
			const folder = folders.get(folderPath) ?? {
				path: folderPath,
				name,
				parentPath: segments.slice(0, -1).join("/"),
				directCount: 0,
				totalCount: 0,
			};
			folder.totalCount += 1;
			if (index === book.folderSegments.length - 1) folder.directCount += 1;
			folders.set(folderPath, folder);
		});
	}

	return [...folders.values()].sort(
		(a, b) =>
			a.path.split("/").length - b.path.split("/").length ||
			a.path.localeCompare(b.path, "zh-CN", { numeric: true }),
	);
}

export function resolveLibraryStats(books: readonly Book[]): LibraryStats {
	return {
		total: books.length,
		finished: books.filter((book) => book.readingStatus === "finished").length,
		reading: books.filter((book) => book.readingStatus === "reading").length,
		epub: books.filter((book) => book.format === "EPUB").length,
	};
}
