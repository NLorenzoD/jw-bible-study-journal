'use client';

import { httpsCallable } from 'firebase/functions';

import { getFirebaseFunctions } from '@/lib/firebase/client';

export interface LinkMetadata {
  title?: string;
  publication_name?: string;
  section_heading?: string;
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return null;
  }

  try {
    const callable = httpsCallable<{ url: string }, LinkMetadata & { fallback?: boolean }>(
      functions,
      'fetchLinkMetadata'
    );
    const result = await callable({ url });
    return {
      title: result.data?.title,
      publication_name: result.data?.publication_name,
      section_heading: result.data?.section_heading
    };
  } catch {
    return null;
  }
}
