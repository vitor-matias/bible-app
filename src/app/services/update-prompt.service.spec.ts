import { DOCUMENT } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { MatBottomSheet } from "@angular/material/bottom-sheet"
import { MatDialog } from "@angular/material/dialog"
import { MatSnackBar } from "@angular/material/snack-bar"
import { SwUpdate, type VersionEvent } from "@angular/service-worker"
import { Subject } from "rxjs"
import {
  UPDATE_PROMPT_DURATION_MS,
  UPDATE_RETRY_MS,
  UpdatePromptService,
} from "./update-prompt.service"

describe("UpdatePromptService", () => {
  let versionUpdates: Subject<VersionEvent>
  let swUpdate: {
    isEnabled: boolean
    versionUpdates: Subject<VersionEvent>
    activateUpdate: ReturnType<typeof vi.fn>
  }
  let snackBar: ReturnType<typeof createSnackBar>
  let dialog: { openDialogs: unknown[] }
  let bottomSheet: { _openedBottomSheetRef: unknown }
  let doc: { visibilityState: string; location: { reload: () => void } }
  let action: Subject<void>

  const ready = {
    type: "VERSION_READY",
    currentVersion: { hash: "old" },
    latestVersion: { hash: "new" },
  } as VersionEvent

  function createSnackBar() {
    const open = vi.fn(() => ({ onAction: () => action }))
    return { open, _openedSnackBarRef: null as unknown }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    versionUpdates = new Subject()
    action = new Subject()
    swUpdate = {
      isEnabled: true,
      versionUpdates,
      activateUpdate: vi.fn().mockResolvedValue(true),
    }
    snackBar = createSnackBar()
    dialog = { openDialogs: [] }
    bottomSheet = { _openedBottomSheetRef: null }
    doc = { visibilityState: "visible", location: { reload: vi.fn() } }
    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdate },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: MatDialog, useValue: dialog },
        { provide: MatBottomSheet, useValue: bottomSheet },
        { provide: DOCUMENT, useValue: doc },
      ],
    })
  })

  const start = () => TestBed.inject(UpdatePromptService).init()

  it("offers a downloaded version, and reloads into it on «Atualizar»", async () => {
    start()
    versionUpdates.next({ type: "VERSION_DETECTED" } as VersionEvent)
    await vi.advanceTimersByTimeAsync(0)
    expect(snackBar.open).not.toHaveBeenCalled()

    versionUpdates.next(ready)
    await vi.advanceTimersByTimeAsync(0)
    expect(snackBar.open).toHaveBeenCalledExactlyOnceWith(
      "Nova versão disponível",
      "Atualizar",
      { duration: UPDATE_PROMPT_DURATION_MS },
    )

    action.next()
    await vi.advanceTimersByTimeAsync(0)
    expect(swUpdate.activateUpdate).toHaveBeenCalled()
    expect(doc.location.reload).toHaveBeenCalled()
  })

  it("waits for the dialog, sheet and message on screen to go", async () => {
    dialog.openDialogs = [{}]
    bottomSheet._openedBottomSheetRef = {}
    snackBar._openedSnackBarRef = {}
    start()
    versionUpdates.next(ready)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    dialog.openDialogs = []
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    bottomSheet._openedBottomSheetRef = null
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    expect(snackBar.open).not.toHaveBeenCalled()

    snackBar._openedSnackBarRef = null
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    expect(snackBar.open).toHaveBeenCalledOnce()

    // Once: a later version doesn't ask again in the same tab.
    versionUpdates.next(ready)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS * 2)
    expect(snackBar.open).toHaveBeenCalledOnce()
  })

  it("waits for the tab to be shown", async () => {
    doc.visibilityState = "hidden"
    start()
    versionUpdates.next(ready)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    expect(snackBar.open).not.toHaveBeenCalled()

    doc.visibilityState = "visible"
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    expect(snackBar.open).toHaveBeenCalledOnce()
  })

  it("offers nothing without a service worker (the native apps)", async () => {
    swUpdate.isEnabled = false
    start()
    versionUpdates.next(ready)
    await vi.advanceTimersByTimeAsync(UPDATE_RETRY_MS)
    expect(snackBar.open).not.toHaveBeenCalled()
  })
})
