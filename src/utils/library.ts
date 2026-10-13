import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
	bookOverrides,
	libraryMeta,
	type Book,
	type BookDefinition,
	type BookFormat,
	type BookStatus,
	type LibraryFolder,
	type LibraryManifest,
	type LibraryStats,
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
	if (localFiles.length > 0) {
		return localFiles.map((absolute) => {
			const relative = toPosix(path.relative(BOOKS_ROOT, absolute));
			const stats = fs.statSync(absolute);
			return {
				publicFile: `/books/${relative}`,
				fileSize: stats.size,
				added: stats.mtime.toISOString().slice(0, 10),
			};
		});
	}

	if (!fs.existsSync(MANIFEST_PATH)) return [];
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
	return manifest.books.map((entry, index) => {
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
		return {
			publicFile: file,
			fileSize: entry.fileSize,
			added: entry.added,
			downloadUrl: entry.downloadUrl,
		};
	});
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
	if (definition.id && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id)) {
		fail(`bookOverrides[${index}].id must use lowercase letters, numbers, and hyphens`);
	}
	if (
		definition.rating !== undefined &&
		(!Number.isFinite(definition.rating) || definition.rating < 0 || definition.rating > 5)
	) {
		fail(`bookOverrides[${index}].rating must be between 0 and 5`);
	}
	if (definition.added && !isValidDate(definition.added)) {
		fail(`bookOverrides[${index}].added must be a valid YYYY-MM-DD date`);
	}
	if (definition.cover) {
		const cover = normalizePublicFile(definition.cover);
		const coverPath = toFileSystemPath(cover);
		if (!fs.existsSync(coverPath) || !fs.statSync(coverPath).isFile()) {
			fail(`bookOverrides[${index}].cover does not exist: ${cover}`);
		}
	}
	return file;
}

export function resolveBooks(): Book[] {
	const sources = resolveBookSources();
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
	return sources
		.map((source): Book | null => {
			const publicFile = source.publicFile;
			const relative = publicFile.slice("/books/".length);
			const override = overrides.get(publicFile);
			if (override?.hidden) return null;
			const format = formatFromPath(relative);
			const title = override?.title?.trim() || cleanTitle(relative);
			const folderPath = path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative);
			const folderSegments = folderPath ? folderPath.split("/") : [];
			const id = stableId(relative, override?.id);
			if (resolvedIds.has(id)) fail(`duplicate resolved book id: ${id}`);
			resolvedIds.add(id);
			const cover = override?.cover ? normalizePublicFile(override.cover) : undefined;
			return {
				id,
				title,
				author: override?.author?.trim() || inferAuthor(relative),
				description:
					override?.description?.trim() ||
					libraryMeta.localFileDescription
						.replace("{format}", format)
						.replace("{title}", title),
				personalReview: override?.personalReview?.trim() || "",
				coverUrl: cover ? encodePublicPath(cover) : undefined,
				fileUrl: source.downloadUrl ?? encodePublicPath(publicFile),
				detailUrl: `/library/${id}/`,
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
		.filter((book): book is Book => book !== null)
		.sort((a, b) => b.added.localeCompare(a.added) || a.title.localeCompare(b.title));
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
