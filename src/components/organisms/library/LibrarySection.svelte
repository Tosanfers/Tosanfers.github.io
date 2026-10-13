<script lang="ts">
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import type {
	Book,
	BookFormat,
	LibraryCopy,
	LibraryFolder,
	LibraryStats,
	ReadingStatus,
} from "../../../data/books";

type SortMode = "added-desc" | "title-asc" | "rating-desc";

let {
	books = [] as Book[],
	folders = [] as LibraryFolder[],
	stats,
	copy,
}: {
	books?: Book[];
	folders?: LibraryFolder[];
	stats: LibraryStats;
	copy: LibraryCopy;
} = $props();

let query = $state("");
let folderPath = $state("");
let category = $state("");
let format = $state<"" | BookFormat>("");
let readingStatus = $state<"" | ReadingStatus>("");
let sort = $state<SortMode>("added-desc");
let initialized = $state(false);

const categories = $derived(
	Array.from(new Set(books.map((book) => book.category))).sort((a, b) =>
		a.localeCompare(b, "zh-CN"),
	),
);

const currentFolder = $derived(folders.find((folder) => folder.path === folderPath));
const folderSegments = $derived(folderPath ? folderPath.split("/") : []);
const folderBreadcrumbs = $derived(
	folderSegments.map((name, index) => ({
		name,
		path: folderSegments.slice(0, index + 1).join("/"),
	})),
);
const childFolders = $derived(
	folders.filter((folder) => folder.parentPath === folderPath),
);

const filteredBooks = $derived.by(() => {
	const normalized = query.trim().toLocaleLowerCase();
	return books
		.filter((book) => {
			if (
				folderPath &&
				book.folderPath !== folderPath &&
				!book.folderPath.startsWith(`${folderPath}/`)
			) return false;
			if (category && book.category !== category) return false;
			if (format && book.format !== format) return false;
			if (readingStatus && book.readingStatus !== readingStatus) return false;
			if (!normalized) return true;
			return [
				book.title,
				book.author,
				book.description,
				book.category,
				book.folderPath,
				...book.tags,
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(normalized);
		})
		.sort((a, b) => {
			if (sort === "title-asc") {
				return a.title.localeCompare(b.title, "zh-CN", { numeric: true });
			}
			if (sort === "rating-desc") {
				return (b.rating ?? -1) - (a.rating ?? -1) || a.title.localeCompare(b.title, "zh-CN");
			}
			return b.added.localeCompare(a.added) || a.title.localeCompare(b.title, "zh-CN", { numeric: true });
		});
});

$effect(() => {
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	for (const key of ["q", "folder", "category", "format", "reading", "sort"]) {
		params.delete(key);
	}
	if (query.trim()) params.set("q", query.trim());
	if (folderPath) params.set("folder", folderPath);
	if (category) params.set("category", category);
	if (format) params.set("format", format.toLowerCase());
	if (readingStatus) params.set("reading", readingStatus);
	if (sort !== "added-desc") params.set("sort", sort);
	const search = params.toString();
	history.replaceState(history.state, "", search ? `?${search}` : window.location.pathname);
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	query = params.get("q") ?? "";
	const requestedFolder = params.get("folder") ?? "";
	folderPath = folders.some((folder) => folder.path === requestedFolder)
		? requestedFolder
		: "";
	category = params.get("category") ?? "";
	const requestedFormat = params.get("format")?.toUpperCase();
	format = requestedFormat === "TXT" || requestedFormat === "EPUB" ? requestedFormat : "";
	const requestedReading = params.get("reading");
	readingStatus =
		requestedReading === "unread" ||
		requestedReading === "reading" ||
		requestedReading === "finished"
			? requestedReading
			: "";
	const requestedSort = params.get("sort");
	sort =
		requestedSort === "title-asc" || requestedSort === "rating-desc"
			? requestedSort
			: "added-desc";
	initialized = true;
});
</script>

<section class="library" aria-labelledby="library-title">
	<header class="library__header">
		<div>
			<p class="library__eyebrow">
				<Icon icon="material-symbols:local-library-outline-rounded" aria-hidden="true" />
				{copy.title}
			</p>
			<h1 id="library-title">{copy.description}</h1>
		</div>
		<span class="library__count">{filteredBooks.length} {copy.countSuffix}</span>
	</header>

	<div class="library__stats">
		<div><strong>{stats.total}</strong><span>{copy.stats.total}</span></div>
		<div><strong>{stats.finished}</strong><span>{copy.stats.finished}</span></div>
		<div><strong>{stats.reading}</strong><span>{copy.stats.reading}</span></div>
		<div><strong>{stats.epub}</strong><span>{copy.stats.epub}</span></div>
	</div>

	{#if folders.length > 0}
		<nav class="library__folders" aria-label={copy.folderNavigation}>
			<div class="library__folder-heading">
				<span>{copy.folderNavigation}</span>
				<ol class="library__breadcrumbs">
					<li>
						<button
							type="button"
							aria-current={folderPath ? undefined : "page"}
							onclick={() => (folderPath = "")}
						>{copy.allBooks}</button>
					</li>
					{#each folderBreadcrumbs as breadcrumb}
						<li>
							<Icon icon="material-symbols:chevron-right-rounded" aria-hidden="true" />
							<button
								type="button"
								aria-current={breadcrumb.path === folderPath ? "page" : undefined}
								onclick={() => (folderPath = breadcrumb.path)}
							>{breadcrumb.name}</button>
						</li>
					{/each}
				</ol>
			</div>

			<div class="library__folder-list">
				{#if currentFolder}
					<button type="button" onclick={() => (folderPath = currentFolder?.parentPath ?? "")}>
						<Icon icon="material-symbols:drive-folder-upload-outline-rounded" aria-hidden="true" />
						<span>{copy.parentFolder}</span>
					</button>
				{/if}
				{#each childFolders as folder (folder.path)}
					<button type="button" onclick={() => (folderPath = folder.path)}>
						<Icon icon="material-symbols:folder-outline-rounded" aria-hidden="true" />
						<span>{folder.name}</span>
						<small>{folder.totalCount}</small>
					</button>
				{/each}
			</div>
		</nav>
	{/if}

	{#if books.length > 0}
		<div class="library__tools">
			<label class="library__search">
				<span class="sr-only">{copy.search}</span>
				<Icon icon="material-symbols:search-rounded" aria-hidden="true" />
				<input type="search" bind:value={query} placeholder={copy.search} />
				{#if query}
					<button type="button" aria-label={copy.clearSearch} onclick={() => (query = "")}>
						<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
					</button>
				{/if}
			</label>

			<div class="library__filters">
				<label>
					<span>{copy.category}</span>
					<select bind:value={category}>
						<option value="">{copy.allCategories}</option>
						{#each categories as item}<option value={item}>{item}</option>{/each}
					</select>
				</label>
				<label>
					<span>{copy.format}</span>
					<select bind:value={format}>
						<option value="">{copy.allFormats}</option>
						<option value="EPUB">EPUB</option>
						<option value="TXT">TXT</option>
					</select>
				</label>
				<label>
					<span>{copy.readingStatus}</span>
					<select bind:value={readingStatus}>
						<option value="">{copy.allReadingStatuses}</option>
						<option value="unread">{copy.readingStatusLabels.unread}</option>
						<option value="reading">{copy.readingStatusLabels.reading}</option>
						<option value="finished">{copy.readingStatusLabels.finished}</option>
					</select>
				</label>
				<label>
					<span>{copy.sort}</span>
					<select bind:value={sort}>
						<option value="added-desc">{copy.sortAddedDesc}</option>
						<option value="title-asc">{copy.sortTitleAsc}</option>
						<option value="rating-desc">{copy.sortRatingDesc}</option>
					</select>
				</label>
			</div>
		</div>
	{/if}

	{#if filteredBooks.length > 0}
		<div class="library__grid" aria-live="polite">
			{#each filteredBooks as book (book.id)}
				<article class="book-card">
					<a class="book-card__cover" href={book.detailUrl} aria-label={`${copy.details}：${book.title}`}>
						{#if book.coverUrl}
							<img src={book.coverUrl} alt={`${book.title}${copy.coverSuffix}`} loading="lazy" decoding="async" />
						{:else}
							<div class="book-card__fallback">
								<Icon icon="material-symbols:menu-book-outline-rounded" aria-hidden="true" />
								<strong>{book.title}</strong>
								<span>{copy.noCover}</span>
							</div>
						{/if}
					</a>

					<div class="book-card__body">
						<div class="book-card__heading">
							<div>
								<h2><a href={book.detailUrl}>{book.title}</a></h2>
								<p>{book.author}</p>
							</div>
							<span class="book-card__format">{book.format}</span>
						</div>

						<div class="book-card__metadata" aria-label={copy.metadataLabel}>
							<span>{book.category}</span>
							<span title={book.folderPath}>{book.folderSegments.at(-1) ?? copy.rootFolder}</span>
							<span>{copy.statusLabels[book.status]}</span>
							<span>{copy.readingStatusLabels[book.readingStatus]}</span>
							<span>{book.fileSizeLabel}</span>
							{#if book.rating !== undefined}<span>{book.rating}/5</span>{/if}
						</div>
						{#if book.tags.length > 0}
							<div class="book-card__tags">
								{#each book.tags as tag}<span>#{tag}</span>{/each}
							</div>
						{/if}

						<div class="book-card__actions">
							<a class="book-card__details" href={book.detailUrl}>{copy.details}</a>
							<a class="book-card__download" href={book.fileUrl} download>
								<Icon icon="material-symbols:download-rounded" aria-hidden="true" />
								{copy.download} {book.format}
							</a>
						</div>
					</div>
				</article>
			{/each}
		</div>
	{:else}
		<div class="library__empty">
			<Icon icon="material-symbols:search-off-rounded" aria-hidden="true" />
			<span>{books.length > 0 ? copy.noResults : copy.empty}</span>
		</div>
	{/if}
</section>

<style lang="stylus">
.library
	padding: var(--m3e-space-6)
	border-radius: var(--shape-corner-l)
	background: var(--card-bg)
	color: var(--on-surface)

	&__header
		display: flex
		align-items: flex-end
		justify-content: space-between
		gap: var(--m3e-space-4)

		h1
			margin: var(--m3e-space-2) 0 0
			font: var(--m3e-type-headline-small)
			font-weight: 700

	&__eyebrow
		display: flex
		align-items: center
		gap: var(--m3e-space-2)
		margin: 0
		color: var(--primary)
		font: var(--m3e-type-label-large)

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

	&__count
		flex: 0 0 auto
		padding: var(--m3e-space-2) var(--m3e-space-3)
		border-radius: var(--shape-corner-full)
		background: var(--secondary-container)
		color: var(--on-secondary-container)
		font: var(--m3e-type-label-medium)

	&__stats
		display: grid
		grid-template-columns: repeat(4, minmax(0, 1fr))
		gap: var(--m3e-space-3)
		margin-top: var(--m3e-space-5)

		> div
			display: flex
			padding: var(--m3e-space-3)
			border-radius: var(--shape-corner-m)
			background: var(--surface-container)
			flex-direction: column
			gap: var(--m3e-space-1)

		strong
			color: var(--primary)
			font: var(--m3e-type-title-large)
			font-weight: 700

		span
			color: var(--on-surface-variant)
			font: var(--m3e-type-label-medium)

	&__folders
		display: grid
		gap: var(--m3e-space-3)
		margin-top: var(--m3e-space-5)
		padding: var(--m3e-space-4)
		border-radius: var(--shape-corner-m)
		background: var(--surface-container)

	&__folder-heading
		display: flex
		align-items: center
		justify-content: space-between
		gap: var(--m3e-space-3)

		> span
			flex: 0 0 auto
			color: var(--on-surface-variant)
			font: var(--m3e-type-label-large)

	&__breadcrumbs
		display: flex
		align-items: center
		justify-content: flex-end
		flex-wrap: wrap
		gap: var(--m3e-space-1)
		margin: 0
		padding: 0
		list-style: none

		li
			display: inline-flex
			align-items: center
			gap: var(--m3e-space-1)

		button
			padding: var(--m3e-space-1) var(--m3e-space-2)
			border: 0
			border-radius: var(--shape-corner-s)
			background: transparent
			color: var(--primary)
			font: var(--m3e-type-label-medium)
			cursor: pointer

		button[aria-current="page"]
			background: var(--secondary-container)
			color: var(--on-secondary-container)

		:global(svg)
			width: 1rem
			height: 1rem
			color: var(--on-surface-variant)

	&__folder-list
		display: flex
		flex-wrap: wrap
		gap: var(--m3e-space-2)

		button
			display: inline-flex
			align-items: center
			gap: var(--m3e-space-2)
			min-height: 2.5rem
			padding: 0 var(--m3e-space-3)
			border: 1px solid var(--outline-variant)
			border-radius: var(--shape-corner-m)
			background: var(--surface-container-low)
			color: var(--on-surface)
			font: var(--m3e-type-label-large)
			cursor: pointer

			> :global(svg)
				width: 1.25rem
				height: 1.25rem
				color: var(--primary)

		small
			display: grid
			place-items: center
			min-width: 1.5rem
			height: 1.5rem
			padding-inline: var(--m3e-space-1)
			border-radius: var(--shape-corner-full)
			background: var(--tertiary-container)
			color: var(--on-tertiary-container)
			font: var(--m3e-type-label-small)

	&__tools
		display: grid
		gap: var(--m3e-space-4)
		margin-top: var(--m3e-space-5)
		padding-block: var(--m3e-space-5)
		border-block: 1px solid var(--outline-variant)

	&__search
		position: relative
		display: flex
		align-items: center
		max-width: 36rem
		min-height: 3rem
		padding-inline: var(--m3e-space-4)
		border: 1px solid var(--outline)
		border-radius: var(--shape-corner-l)
		background: var(--surface-container-low)
		color: var(--on-surface-variant)

		> :global(svg)
			flex: 0 0 auto
			width: 1.25rem
			height: 1.25rem

		input
			min-width: 0
			width: 100%
			padding: 0 var(--m3e-space-3)
			border: 0
			outline: 0
			background: transparent
			color: var(--on-surface)
			font: var(--m3e-type-body-large)

		button
			display: grid
			place-items: center
			width: 2rem
			height: 2rem
			padding: 0
			border: 0
			border-radius: var(--shape-corner-full)
			background: transparent
			color: var(--on-surface-variant)
			cursor: pointer

	&__filters
		display: grid
		grid-template-columns: repeat(4, minmax(0, 1fr))
		gap: var(--m3e-space-3)

		label
			display: grid
			gap: var(--m3e-space-1)
			color: var(--on-surface-variant)
			font: var(--m3e-type-label-medium)

		select
			width: 100%
			min-height: 2.75rem
			padding-inline: var(--m3e-space-3)
			border: 1px solid var(--outline-variant)
			border-radius: var(--shape-corner-m)
			background: var(--surface-container-low)
			color: var(--on-surface)
			font: var(--m3e-type-body-medium)

	&__grid
		display: grid
		grid-template-columns: minmax(0, 1fr)
		gap: var(--m3e-space-4)
		padding-top: var(--m3e-space-5)

	&__empty
		display: grid
		place-items: center
		gap: var(--m3e-space-3)
		min-height: 12rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)

		> :global(svg)
			width: 2rem
			height: 2rem

.book-card
	display: grid
	grid-template-columns: minmax(7rem, 34%) minmax(0, 1fr)
	min-width: 0
	overflow: hidden
	border: 1px solid var(--outline-variant)
	border-radius: var(--shape-corner-l)
	background: var(--surface-container-low)
	transition: border-color var(--m3e-duration-medium) var(--m3e-easing-standard), box-shadow var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

	&:hover
		border-color: var(--outline)
		box-shadow: var(--m3e-elevation-1)

	&__cover
		display: block
		min-height: 12rem
		background: var(--surface-container-high)
		color: inherit
		text-decoration: none

		> img
			display: block
			width: 100%
			height: 100%
			object-fit: cover

	&__fallback
		display: flex
		align-items: center
		justify-content: center
		flex-direction: column
		gap: var(--m3e-space-2)
		height: 100%
		padding: var(--m3e-space-4)
		background: linear-gradient(145deg, var(--primary-container), var(--tertiary-container))
		color: var(--on-primary-container)
		text-align: center

		> :global(svg)
			width: 2.5rem
			height: 2.5rem

		strong
			font: var(--m3e-type-title-medium)
			font-weight: 700

		span
			font: var(--m3e-type-label-small)

	&__body
		display: flex
		min-width: 0
		padding: var(--m3e-space-4)
		flex-direction: column

	&__heading
		display: flex
		align-items: flex-start
		justify-content: space-between
		gap: var(--m3e-space-3)

		h2
			margin: 0
			font: var(--m3e-type-title-large)
			font-weight: 700

			a
				color: inherit
				text-decoration: none

				&:hover
					color: var(--primary)

		p
			margin: var(--m3e-space-1) 0 0
			color: var(--on-surface-variant)
			font: var(--m3e-type-body-medium)

	&__format
		flex: 0 0 auto
		padding: var(--m3e-space-1) var(--m3e-space-2)
		border-radius: var(--shape-corner-full)
		background: var(--tertiary-container)
		color: var(--on-tertiary-container)
		font: var(--m3e-type-label-small)

	&__metadata,
	&__tags
		display: flex
		flex-wrap: wrap
		gap: var(--m3e-space-2)
		margin-top: var(--m3e-space-3)
		font: var(--m3e-type-label-medium)

	&__metadata
		color: var(--on-surface-variant)

		span
			padding: var(--m3e-space-1) var(--m3e-space-2)
			border-radius: var(--shape-corner-full)
			background: var(--surface-container-high)

	&__tags
		color: var(--primary)

	&__actions
		display: flex
		flex-wrap: wrap
		gap: var(--m3e-space-2)
		margin-top: auto
		padding-top: var(--m3e-space-4)

	&__details,
	&__download
		display: inline-flex
		align-items: center
		justify-content: center
		gap: var(--m3e-space-2)
		min-height: 2.5rem
		padding: 0 var(--m3e-space-4)
		border-radius: var(--shape-corner-full)
		font: var(--m3e-type-label-large)
		text-decoration: none

	&__details
		background: var(--secondary-container)
		color: var(--on-secondary-container)

	&__download
		background: var(--primary)
		color: var(--on-primary)

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

:global(html.motion-reduced) .book-card
	transition: none

@media (prefers-reduced-motion: reduce)
	.book-card
		transition: none

@media (max-width: 56rem)
	.library__filters
		grid-template-columns: repeat(2, minmax(0, 1fr))

@media (max-width: 40rem)
	.library
		padding: var(--m3e-space-4)

		&__header
			align-items: flex-start
			flex-direction: column

		&__folder-heading
			align-items: flex-start
			flex-direction: column

		&__breadcrumbs
			justify-content: flex-start

		&__stats,
		&__filters
			grid-template-columns: repeat(2, minmax(0, 1fr))

	.book-card
		grid-template-columns: 7rem minmax(0, 1fr)

		&__cover
			min-height: 12rem

		&__actions a
			width: 100%
</style>
