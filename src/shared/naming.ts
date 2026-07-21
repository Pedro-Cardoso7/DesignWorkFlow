import type { StagingImage } from './types';

export function deriveOutfitNameFromStaging(s: StagingImage): string {
  if (s.metadata.prompt) {
    const first = s.metadata.prompt.split(/[,.\-\n]/)[0].trim();
    if (first.length >= 3 && first.length <= 40) return first;
  }
  const d = new Date(s.addedAt);
  return `Outfit ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
