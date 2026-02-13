import bibleStructure from '@/lib/constants/bible-structure.json';

export interface BibleBookStructure {
  book: string;
  chapters: number[];
}

export interface ScriptureReference {
  book: string;
  chapter: number;
  verse: number;
}

export const BIBLE_STRUCTURE = bibleStructure as BibleBookStructure[];

export const BIBLE_BOOKS: Array<{ name: string; chapters: number }> = BIBLE_STRUCTURE.map((entry) => ({
  name: entry.book,
  chapters: entry.chapters.length
}));

export function getBook(name: string) {
  return BIBLE_BOOKS.find((book) => book.name === name);
}

export function getBookStructure(name: string) {
  return BIBLE_STRUCTURE.find((book) => book.book === name);
}

export function getChapterVerseCount(bookName: string, chapterNumber: number) {
  const structure = getBookStructure(bookName);
  if (!structure || chapterNumber < 1 || chapterNumber > structure.chapters.length) {
    return 1;
  }
  return structure.chapters[chapterNumber - 1];
}

export function getBookIndex(bookName: string) {
  return BIBLE_STRUCTURE.findIndex((book) => book.book === bookName);
}

export function compareReferences(left: ScriptureReference, right: ScriptureReference) {
  const leftBookIndex = getBookIndex(left.book);
  const rightBookIndex = getBookIndex(right.book);

  if (leftBookIndex !== rightBookIndex) {
    return leftBookIndex - rightBookIndex;
  }

  if (left.chapter !== right.chapter) {
    return left.chapter - right.chapter;
  }

  return left.verse - right.verse;
}

export function getNextReference(reference: ScriptureReference) {
  const versesInChapter = getChapterVerseCount(reference.book, reference.chapter);
  if (reference.verse < versesInChapter) {
    return { ...reference, verse: reference.verse + 1 };
  }

  const currentBook = getBookStructure(reference.book);
  if (currentBook && reference.chapter < currentBook.chapters.length) {
    return { ...reference, chapter: reference.chapter + 1, verse: 1 };
  }

  const currentBookIndex = getBookIndex(reference.book);
  const nextBook = BIBLE_STRUCTURE[currentBookIndex + 1];
  if (!nextBook) {
    return reference;
  }

  return { book: nextBook.book, chapter: 1, verse: 1 };
}

export function countChaptersInRange(start: ScriptureReference, end: ScriptureReference) {
  if (compareReferences(start, end) > 0) {
    return 0;
  }

  const startBookIndex = getBookIndex(start.book);
  const endBookIndex = getBookIndex(end.book);
  if (startBookIndex < 0 || endBookIndex < 0) {
    return 0;
  }

  if (startBookIndex === endBookIndex) {
    return end.chapter - start.chapter + 1;
  }

  let total = 0;
  for (let index = startBookIndex; index <= endBookIndex; index += 1) {
    const book = BIBLE_STRUCTURE[index];
    if (!book) {
      continue;
    }

    if (index === startBookIndex) {
      total += book.chapters.length - start.chapter + 1;
      continue;
    }

    if (index === endBookIndex) {
      total += end.chapter;
      continue;
    }

    total += book.chapters.length;
  }

  return total;
}
