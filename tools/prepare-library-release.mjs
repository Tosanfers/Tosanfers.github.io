import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";

const DEFAULT_REPOSITORY = "Tosanfers/Tosanfers.github.io";
const DEFAULT_TAG = "library-v1";
const PROJECT_ROOT = path.resolve(process.env.LIBRARY_PROJECT_ROOT ?? process.cwd());
const OUTPUT_PATH = path.join(PROJECT_ROOT, "src/data/library.generated.json");
const STAGING_ROOT = path.join(PROJECT_ROOT, ".library-release");
const ASSETS_ROOT = path.join(STAGING_ROOT, "assets");

function readArgument(name, fallback) {
	const prefix = `--${name}=`;
	const inline = process.argv.find((argument) => argument.startsWith(prefix));
	if (inline) return inline.slice(prefix.length).trim();
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1]?.trim() : fallback;
}

function validateRepository(repository) {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
		throw new Error("--repository must use owner/repository format");
	}
	return repository;
}

function validateTag(tag) {
	if (!tag || /[\\\s]/.test(tag)) {
		throw new Error("--tag must be a non-empty tag without spaces or backslashes");
	}
	return tag;
}

function containsBooks(directory) {
	if (!fs.existsSync(directory)) return false;
	return fs.readdirSync(directory, { withFileTypes: true }).some((entry) => {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) return containsBooks(absolute);
		return entry.isFile() && /\.(?:txt|epub)$/i.test(entry.name);
	});
}

async function sha256(filePath) {
	const hash = crypto.createHash("sha256");
	await pipeline(fs.createReadStream(filePath), hash);
	return hash.digest("hex");
}

function stageAsset(source, destination) {
	try {
		fs.linkSync(source, destination);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			["EACCES", "EPERM", "EXDEV", "ENOTSUP"].includes(error.code)
		) {
			fs.copyFileSync(source, destination);
			return;
		}
		throw error;
	}
}

function createUploadScript(repository, tag) {
	return `$ErrorActionPreference = "Stop"
$Repository = "${repository}"
$Tag = "${tag}"
$Assets = Join-Path $PSScriptRoot "assets"

gh auth status
gh release view $Tag --repo $Repository *> $null
if ($LASTEXITCODE -ne 0) {
    gh release create $Tag --repo $Repository --title "小说书库资源" --notes "博客书库的 TXT/EPUB 下载资源。"
}

Get-ChildItem -LiteralPath $Assets -File | ForEach-Object {
    Write-Host "Uploading $($_.Name)"
    gh release upload $Tag $_.FullName --repo $Repository --clobber
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $($_.Name)" }
}
`;
}

const repository = validateRepository(readArgument("repository", DEFAULT_REPOSITORY));
const tag = validateTag(readArgument("tag", DEFAULT_TAG));
const archivedSource = path.join(PROJECT_ROOT, ".library-source");
const publicSource = path.join(PROJECT_ROOT, "public/books");
const sourceRoot = path.resolve(
	readArgument(
		"source",
		containsBooks(archivedSource) ? archivedSource : publicSource,
	),
);
process.env.LIBRARY_BOOKS_ROOT = sourceRoot;
const { resolveBooks } = await import(`../src/utils/library.ts?prepare=${Date.now()}`);
const books = resolveBooks();

if (books.length === 0) {
	throw new Error(`No local TXT or EPUB files were found under ${sourceRoot}`);
}
if (books.some((book) => !book.fileUrl.startsWith("/books/"))) {
	throw new Error("Local book files are required to regenerate the release manifest");
}

fs.rmSync(STAGING_ROOT, { recursive: true, force: true });
fs.mkdirSync(ASSETS_ROOT, { recursive: true });

const entries = [];
for (const [index, book] of books.entries()) {
	const publicFile = decodeURIComponent(book.fileUrl);
	const source = path.join(sourceRoot, ...publicFile.slice("/books/".length).split("/"));
	const extension = path.extname(source).toLowerCase();
	const assetName = `${book.id}${extension}`;
	const destination = path.join(ASSETS_ROOT, assetName);
	stageAsset(source, destination);
	entries.push({
		file: publicFile,
		assetName,
		downloadUrl: `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`,
		fileSize: book.fileSize,
		added: book.added,
		sha256: await sha256(source),
	});
	process.stdout.write(`\rPrepared ${index + 1}/${books.length}`);
}

const manifest = {
	version: 1,
	repository,
	tag,
	books: entries,
};
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, "\t")}\n`);
fs.writeFileSync(
	path.join(STAGING_ROOT, "upload.ps1"),
	createUploadScript(repository, tag),
);

const totalBytes = entries.reduce((total, entry) => total + entry.fileSize, 0);
process.stdout.write("\n");
console.log(`Manifest: ${path.relative(PROJECT_ROOT, OUTPUT_PATH)}`);
console.log(`Assets: ${path.relative(PROJECT_ROOT, ASSETS_ROOT)}`);
console.log(`Books: ${entries.length}`);
console.log(`Total: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);
console.log("Upload command: powershell -ExecutionPolicy Bypass -File .library-release/upload.ps1");
