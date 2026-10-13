import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

const PROJECT_ROOT = path.resolve(process.env.LIBRARY_PROJECT_ROOT ?? process.cwd());
const MANIFEST_PATH = path.join(PROJECT_ROOT, "src/data/library.generated.json");
const PUBLIC_BOOKS_ROOT = path.join(PROJECT_ROOT, "public/books");
const ARCHIVE_ROOT = path.join(PROJECT_ROOT, ".library-source");
const SKIP_REMOTE_CHECK = process.argv.includes("--skip-remote-check");

async function sha256(filePath) {
	const hash = crypto.createHash("sha256");
	await pipeline(fs.createReadStream(filePath), hash);
	return hash.digest("hex");
}

function checkWithCurl(url) {
	return new Promise((resolve, reject) => {
		const child = spawn("curl", ["-L", "-I", "--fail", "--silent", "--show-error", url], {
			stdio: "ignore",
		});
		child.once("error", reject);
		child.once("exit", (code) =>
			code === 0 ? resolve() : reject(new Error(`curl exited with ${code}: ${url}`)),
		);
	});
}

async function checkRemote(url) {
	try {
		const response = await fetch(url, { method: "HEAD", redirect: "follow" });
		if (!response.ok) throw new Error(`${response.status} ${url}`);
	} catch (error) {
		try {
			await checkWithCurl(url);
		} catch {
			throw error;
		}
	}
}

if (!fs.existsSync(MANIFEST_PATH)) {
	throw new Error("Run pnpm.cmd library:prepare before finalizing the migration");
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
if (manifest.version !== 1 || !Array.isArray(manifest.books)) {
	throw new Error("Invalid library release manifest");
}

for (const [index, entry] of manifest.books.entries()) {
	const relative = entry.file.replace(/^\/books\//, "");
	const source = path.join(PUBLIC_BOOKS_ROOT, ...relative.split("/"));
	if (!fs.existsSync(source)) {
		throw new Error(`Local source is missing: ${entry.file}`);
	}
	const digest = await sha256(source);
	if (digest !== entry.sha256) {
		throw new Error(`Local source changed after manifest generation: ${entry.file}`);
	}
	process.stdout.write(`\rChecked local file ${index + 1}/${manifest.books.length}`);
}

if (SKIP_REMOTE_CHECK) {
	process.stdout.write(
		"\nSkipping remote checks because the uploaded assets were verified separately.\n",
	);
} else {
	process.stdout.write("\nChecking uploaded Release assets...\n");
	let nextRemoteIndex = 0;
	const failures = [];
	async function remoteWorker() {
		while (nextRemoteIndex < manifest.books.length) {
			const index = nextRemoteIndex;
			nextRemoteIndex += 1;
			try {
				await checkRemote(manifest.books[index].downloadUrl);
				process.stdout.write(`\rChecked remote asset ${index + 1}/${manifest.books.length}`);
			} catch (error) {
				failures.push(error);
			}
		}
	}
	await Promise.all(Array.from({ length: 6 }, () => remoteWorker()));
	process.stdout.write("\n");
	if (failures.length > 0) {
		for (const failure of failures.slice(0, 5)) console.error(failure);
		throw new Error(`${failures.length} Release assets could not be verified; no files were moved`);
	}
}

for (const entry of manifest.books) {
	const relative = entry.file.replace(/^\/books\//, "");
	const source = path.join(PUBLIC_BOOKS_ROOT, ...relative.split("/"));
	const destination = path.join(ARCHIVE_ROOT, ...relative.split("/"));
	if (fs.existsSync(destination)) {
		throw new Error(`Archive destination already exists: ${destination}`);
	}
	fs.mkdirSync(path.dirname(destination), { recursive: true });
	fs.renameSync(source, destination);
}

console.log(`Moved ${manifest.books.length} verified files to .library-source/`);
console.log("The Git worktree now contains deletions for the old Pages binaries.");
console.log("Review those deletions and the generated manifest before committing.");
