import type { Book } from "../data/books";

export interface LibraryBookGroup {
	key: string;
	series?: string;
	books: Book[];
}

function compareSeriesVolumes(a: Book, b: Book): number {
	if (a.volume !== undefined || b.volume !== undefined) {
		if (a.volume === undefined) return 1;
		if (b.volume === undefined) return -1;
		if (a.volume !== b.volume) return a.volume - b.volume;
	}
	return (
		a.title.localeCompare(b.title, "zh-CN", { numeric: true }) || a.id.localeCompare(b.id)
	);
}

export function groupBooksBySeries(books: readonly Book[]): LibraryBookGroup[] {
	const groups = new Map<string, LibraryBookGroup>();

	for (const book of books) {
		const normalizedSeries = book.series?.normalize("NFKC").trim().toLocaleLowerCase();
		const key = normalizedSeries ? `series:${normalizedSeries}` : "standalone";
		const group = groups.get(key) ?? {
			key,
			series: book.series,
			books: [],
		};
		group.books.push(book);
		groups.set(key, group);
	}

	return [...groups.values()]
		.map((group) => ({
			...group,
			books: group.series ? group.books.toSorted(compareSeriesVolumes) : group.books,
		}))
		.sort((a, b) => {
			if (a.series && !b.series) return -1;
			if (!a.series && b.series) return 1;
			return 0;
		});
}
