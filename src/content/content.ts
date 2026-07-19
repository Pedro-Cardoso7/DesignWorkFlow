// Content script for midjourney.com.
// Injects a hover-reveal "+" button on each MJ image tile that adds the image
// to the active collection's staging area. DOM-hooking logic will be added
// iteratively — this file currently only signals presence.

console.log('[MJ Designer Workflow] content script loaded on', location.href);

export {};