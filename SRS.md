# Software Requirements Specification
## MJ Designer Workflow Extension

**Version:** 1.0 (MVP)
**Date:** 2026-07-19
**Author:** Pedro Cardoso
**Status:** Draft — approved for MVP scope

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for a Chrome extension that streamlines a fashion designer's workflow of collecting Midjourney-generated outfit renders, decomposing them into individual asset crops (tops, pants, shoes, accessories, hair, makeup, etc.), and organizing them into structured collections ready for downstream design use.

### 1.2 Scope
The extension augments the Midjourney web application (`midjourney.com`) with an in-page selection mechanism and a persistent side-panel workspace where the user assembles collections of outfits, each composed of cropped assets extracted from Midjourney source images. Collections are persisted locally and exported on demand as a ZIP archive.

The MVP is a **personal-use tool** for a single designer, installed via Chrome developer mode. It is not published to the Chrome Web Store.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| **Collection** | Top-level project container (e.g., "Summer 2026"). Holds many outfits. User-named. |
| **Outfit** | A single Midjourney-generated look. Contains one source image and N cropped assets. Auto-named ("Outfit 1", "Outfit 2"). |
| **Asset** | A rectangular crop from an outfit's source image (e.g., a top, a shoe, an earring). Auto-numbered ("asset-1", "asset-2"). |
| **Staging area** | Per-collection queue of raw Midjourney images added but not yet cropped. |
| **Active collection** | The collection currently receiving new images from the `+` button on Midjourney. One at a time. |
| **Source image** | The original full-resolution Midjourney render that an outfit's assets are cropped from. Preserved as `outfit.png` in the sync folder. |
| **Manifest** | `manifest.json` file at the collection root containing all metadata (prompts, timestamps, MJ params, job IDs, URLs). |

### 1.4 References
- Midjourney web app: `midjourney.com` (own creations page)
- Chrome Extensions Manifest V3
- Chrome Side Panel API
- IndexedDB

### 1.5 Overview
Section 2 describes the product at a high level. Section 3 specifies functional requirements (data model, workflow, UI, CRUD). Section 4 specifies non-functional requirements (performance, robustness, storage). Section 5 lists what is explicitly out of scope for the MVP.

---

## 2. Overall Description

### 2.1 Product Perspective
The extension is a Chrome Manifest V3 add-on with three surfaces:
1. **Content script** injected into `midjourney.com` — adds a hover-reveal `+` button to each image.
2. **Side panel** — persistent workspace showing the active collection, staging area, and outfits.
3. **Modal** — full-canvas cropping surface, opened from the side panel.

State is persisted in **IndexedDB**. The user exports a collection as a ZIP archive on demand; the ZIP is the primary deliverable.

### 2.2 Product Functions (Summary)
- Add MJ-generated images to a per-collection staging area with one click
- Silently capture MJ metadata (prompt, timestamp, params, job ID, URL) alongside each image
- Open staged images in a cropping modal; draw multiple rectangular crop regions in a single session
- Save each cropping session as an outfit (one source image + N assets)
- Manage multiple collections; switch the "active" one via a side-panel dropdown
- Export a collection as a ZIP archive on demand
- Basic CRUD: delete collections/outfits/assets; add assets to existing outfits; rename collections

### 2.3 User Characteristics
Single user: a fashion designer with an active Midjourney subscription who generates full-outfit renders and needs to extract individual garment assets for downstream design work. Assumed to be comfortable installing a Chrome extension in developer mode and granting local-folder permissions once.

### 2.4 Constraints
- **CON-1**: Midjourney has no public API. Integration relies on scraping the MJ web DOM, which may change without warning.
- **CON-2**: Extraction and re-hosting of MJ-generated images may violate Midjourney's Terms of Service. Risk is accepted for personal use; extension shall not be publicly distributed.
- **CON-3**: Chrome Manifest V3 restrictions apply (no persistent background pages; service workers only).
- **CON-4**: All data is local to a single browser profile. No cloud sync, no multi-device.

### 2.5 Assumptions and Dependencies
- User runs the latest stable Chrome (or Chromium-based browser with equivalent APIs).
- Midjourney web app remains reachable and structurally scrapeable at `midjourney.com`.
- Midjourney continues to serve full-resolution image URLs from a public CDN reachable by the extension.
- User has sufficient browser storage quota for the dataset (~2 GB per 100 outfits with full-res sources).

---

## 3. Specific Requirements

### 3.1 Functional Requirements

#### 3.1.1 Data Model

**FR-DM-1** The system SHALL maintain a strict three-level hierarchy: Collection → Outfit → Asset.

**FR-DM-2** A Collection SHALL have: a user-editable name, a creation timestamp, and an ordered list of outfits.

**FR-DM-3** An Outfit SHALL have: an auto-generated name ("Outfit N"), a creation timestamp, one source image (`outfit.png`), an ordered list of assets, and captured MJ metadata (prompt, MJ params, job ID, source URL, MJ-side timestamp).

**FR-DM-4** An Asset SHALL have: an auto-generated name ("asset-N"), a creation timestamp, and rectangular crop coordinates relative to the source image.

**FR-DM-5** Asset types SHALL be free-form (no fixed schema of top/pants/shoes). Any number of assets per outfit is permitted.

**FR-DM-6** In the MVP, an asset SHALL belong to exactly one outfit. Cross-outfit reuse is not supported.

**FR-DM-7** The system SHALL support multiple collections simultaneously. Exactly one collection is marked "active" at any time.

#### 3.1.2 Midjourney Page Integration

**FR-MJ-1** The extension's content script SHALL activate on the user's own creations page(s) on `midjourney.com`.

**FR-MJ-2** For each Midjourney image detected on the page, the extension SHALL inject a hover-revealed `+` button in a corner of the image.

**FR-MJ-3** A single click on the `+` button SHALL add the image to the active collection's staging area and change the button to a checkmark (which remains hover-revealed).

**FR-MJ-4** Clicking the checkmark on an already-added image SHALL remove it from the staging area and revert the button to `+`.

**FR-MJ-5** When an image is added, the extension SHALL attempt to capture the following metadata from the surrounding DOM: prompt text, MJ generation timestamp, MJ parameters (`--ar`, `--v`, `--style`, etc.), job ID, and full-resolution image URL.

**FR-MJ-6** Metadata capture failures SHALL be silent and SHALL NOT prevent the image itself from being saved. Missing fields SHALL be recorded as `null` in the manifest.

**FR-MJ-7** The extension SHALL fetch the full-resolution image via the captured CDN URL and store the resulting bytes. If the full-resolution URL cannot be resolved, the extension SHALL fall back to the DOM `<img src>` value and mark the asset with `low_resolution: true` in the manifest.

**FR-MJ-8** The extension SHALL NOT interfere with Midjourney's native keyboard shortcuts, drag-and-drop, or UI selection behavior.

**FR-MJ-9** If DOM selectors for images or metadata fail during activation, the extension SHALL display a non-blocking banner in the side panel: *"Midjourney layout appears to have changed — extension update needed."*

#### 3.1.3 Side Panel Workspace

**FR-SP-1** The extension SHALL provide a Chrome side panel accessible on `midjourney.com`.

**FR-SP-2** The side panel SHALL display, from top to bottom:
1. Active-collection dropdown (with option to create a new collection)
2. Rename control for the active collection
3. Staging area — thumbnail list of images added but not yet cropped
4. Outfit list — cards showing source thumbnail, prompt snippet, timestamp, and asset count
5. Manual "Export ZIP" button

**FR-SP-3** Clicking a staged image SHALL open it in the cropping modal.

**FR-SP-4** Clicking an outfit card SHALL open a detail view showing the source image and all assets, with delete controls per asset and an "Add assets" button that reopens the source in the cropping modal.

#### 3.1.4 Cropping Modal

**FR-CR-1** The cropping modal SHALL display the source image at full available canvas size.

**FR-CR-2** The user SHALL be able to draw multiple independent rectangular crop regions on the same canvas within a single session.

**FR-CR-3** Rectangle aspect ratios SHALL be free-form (no constraints).

**FR-CR-4** The user SHALL be able to delete an individual crop rectangle before saving.

**FR-CR-5** An undo action SHALL revert the last crop-rectangle addition or deletion within the current session.

**FR-CR-6** Clicking "Save all" SHALL create an outfit containing the source image plus one asset per crop rectangle, then close the modal.

**FR-CR-7** When reopening an existing outfit's source image for editing, the modal SHALL display existing asset rectangles as editable. Saving SHALL update the outfit's asset list to match the current rectangles.

**FR-CR-8** Assets SHALL be numbered by draw order within the session; ordering is not user-configurable in MVP.

#### 3.1.5 CRUD Operations

**FR-CRUD-1** The user SHALL be able to create a new collection at any time via the active-collection dropdown.

**FR-CRUD-2** The user SHALL be able to rename a collection inline in the side panel.

**FR-CRUD-3** The user SHALL be able to delete a collection. A confirmation dialog listing the outfit count SHALL be shown before deletion.

**FR-CRUD-4** The user SHALL be able to delete an outfit. A confirmation dialog listing the asset count SHALL be shown before deletion.

**FR-CRUD-5** The user SHALL be able to delete an individual asset from an outfit with a single click (no confirmation).

**FR-CRUD-6** The user SHALL be able to add new assets to an existing outfit via the "Add assets" action, which reopens the source image in the cropping modal per FR-CR-7.

**FR-CRUD-7** Rename of outfits and assets is NOT supported in MVP. Reorder of outfits and assets is NOT supported in MVP. Moving outfits between collections is NOT supported in MVP.

#### 3.1.6 Storage

**FR-ST-1** Internal state (collections, outfits, assets, images, metadata) SHALL be persisted in IndexedDB. Every mutation SHALL be persisted immediately.

**FR-ST-2** All image blobs (source images and cropped assets) SHALL be stored as PNG in IndexedDB.

**FR-ST-3** Deleting a collection, outfit, or asset SHALL delete its associated blobs in the same transaction (no orphaned blobs).

#### 3.1.7 Export

**FR-EX-1** The user SHALL be able to trigger a manual "Export ZIP" for any collection.

**FR-EX-2** The ZIP structure SHALL be:
```
<collection-name>/
├── manifest.json
├── Outfit 1/
│   ├── outfit.png
│   ├── asset-1.png
│   ├── asset-2.png
│   └── asset-N.png
├── Outfit 2/
│   ├── outfit.png
│   └── asset-1.png
└── Outfit N/ ...
```

**FR-EX-3** All image files SHALL be PNG.

**FR-EX-4** `manifest.json` SHALL contain, for each outfit: the outfit name, MJ prompt, MJ generation timestamp, MJ parameters, MJ job ID, source URL, `low_resolution` flag (if applicable), asset list (name + crop coordinates), and creation/modification timestamps.

**FR-EX-5** Manual export SHALL NOT delete or alter internal state. Collections remain editable after export.

---

### 3.2 Non-Functional Requirements

#### 3.2.1 Performance
**NFR-PERF-1** The `+` button SHALL appear within 100 ms of the user hovering an MJ image.

**NFR-PERF-2** Adding an image to staging (including full-res fetch) SHALL complete within 3 seconds under normal network conditions.

**NFR-PERF-3** The cropping modal SHALL render source images up to 4K resolution at 60 fps for pan and rectangle draw.


#### 3.2.2 Scale
**NFR-SCALE-1** The extension SHALL handle at least 20 collections, 500 outfits per collection, and 20 assets per outfit without perceptible UI degradation.

**NFR-SCALE-2** The extension SHALL handle an IndexedDB dataset of at least 10 GB.

#### 3.2.3 Robustness
**NFR-ROB-1** Image capture SHALL never fail silently. Every failed capture SHALL be visible in the UI.

**NFR-ROB-2** Metadata capture SHALL always fail silently, with missing fields recorded as `null`.

**NFR-ROB-3** IndexedDB writes SHALL be transactional.

**NFR-ROB-4** On MJ DOM changes that break selectors, the extension SHALL degrade gracefully (banner shown, previously-saved data unaffected).

#### 3.2.4 Usability
**NFR-USE-1** The workspace SHALL require zero configuration on first run.

**NFR-USE-2** Destructive actions on collections and outfits SHALL require explicit confirmation. Destructive actions on individual assets SHALL NOT (cheap to redo).

#### 3.2.5 Browser Compatibility
**NFR-COMPAT-1** The extension SHALL target the latest stable Chrome (Manifest V3). Compatibility with other Chromium-based browsers (Edge, Brave) is desirable but not tested in MVP.

#### 3.2.6 Security & Privacy
**NFR-SEC-1** The extension SHALL request the minimum Chrome permissions required: content script access to `midjourney.com`, side panel, and storage.

**NFR-SEC-2** No user data SHALL be transmitted off-device. There is no backend.

**NFR-SEC-3** The extension SHALL NOT log or exfiltrate scraped MJ content beyond what is stored locally per the user's actions.

---

## 4. External Interface Requirements

### 4.1 Midjourney Web App
- **Read**: DOM structure of user's creations page (image tiles, prompt text, MJ parameters, job IDs, image URLs)
- **Write**: None. The extension SHALL NOT modify MJ's own DOM state, submit prompts, or interact with MJ's server-side APIs.

### 4.2 Browser APIs
- Chrome Manifest V3 (service worker, content script, side panel)
- IndexedDB
- Fetch API (for full-res image retrieval from MJ CDN)

---

## 5. Out of Scope (MVP)

The following are explicitly deferred beyond MVP scope. They are listed here to prevent scope creep and to signal what future iterations may address:

- **LLM-generated design sheets** — the originally-envisioned end-goal of feeding cropped assets to an LLM for automated tech-pack generation. Deferred pending MVP validation.
- **AI-assisted segmentation / transparent cutouts** — clean garment isolation via SAM, rembg, or similar. Users will rely on a consistent Midjourney background prompt for visual coherence in MVP.
- **Cross-outfit asset reuse** — a single asset appearing in multiple outfits.
- **Reordering** of outfits within a collection or assets within an outfit.
- **Moving outfits** between collections.
- **Renaming** of outfits and assets (only collections are renameable in MVP).
- **Midjourney Discord integration** — MVP is web-only.
- **Explore/community feed** as a first-class target — extension may work incidentally on those pages but they are not tested.
- **Cloud accounts, multi-user, real-time collaboration.**
- **Chrome Web Store distribution** — MVP is dev-mode install only.
- **Batch or lasso selection** on the Midjourney page — MVP uses single-click add.
- **AI-suggested crop regions** — MVP is fully manual rectangle drawing.
- **Continuous sync to a local folder** — deferred; ZIP export is the interchange format.
- **Scheduled backups, backup nags, cloud backup providers.**