"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, ArrowLeft, Check, CheckSquare, ChevronDown,
  CircleHelp, Cloud, Columns3, Copy, Download, ExternalLink, FileText,
  HardDrive, Image as ImageIcon, LayoutDashboard, Link2, Loader2, Maximize2,
  MoreHorizontal, MousePointer2, Paperclip, Pencil, Plus, Search, Share2,
  Sparkles, Star, Trash2, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { useWebMCP } from "@/app/use-webmcp";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type CardType = "note" | "todo" | "link" | "image" | "column" | "file";
type AddableCardType = Exclude<CardType, "file">;
type Item = {
  id: string; type: CardType; x: number; y: number; w: number;
  title: string; body: string; color: string; checked?: boolean;
  image?: string; url?: string; storage?: "local" | "cloud";
  fileKey?: string; fileName?: string; mime?: string; size?: number;
  h?: number;
};
type Board = {
  id: string; title: string; emoji: string; color: string; updated: number;
  starred: boolean; archived?: boolean; items: Item[];
};
type View = "boards" | "starred" | "archive";
type DragState = { id: string; dx: number; dy: number };
type SyncStatus = "loading" | "saving" | "saved" | "offline";

const uid = () => Math.random().toString(36).slice(2, 10);
const WORKSPACE_KEY_STORAGE = "canvas-boards-workspace-key";
function clientWorkspaceKey() {
  let key = localStorage.getItem(WORKSPACE_KEY_STORAGE);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(WORKSPACE_KEY_STORAGE, key);
  }
  return key;
}
const palette = ["#fff3a8", "#f8c9c0", "#dbead8", "#cfe7f5", "#e5dcf7", "#ffffff"];
const starterBoards: Board[] = [
  {
    id: "content", title: "My first YouTube video", emoji: "🎬",
    color: "#cf6e4b", updated: Date.now(), starred: true,
    items: [
      { id: "i1", type: "column", x: 90, y: 110, w: 285, title: "THE BIG IDEA", body: "", color: "#fbf7ef" },
      { id: "i2", type: "note", x: 115, y: 195, w: 235, title: "What I know that younger people don’t", body: "A practical, honest video drawn from 50+ years of lived experience.", color: "#fff3a8" },
      { id: "i3", type: "column", x: 425, y: 110, w: 290, title: "STORY BEATS", body: "", color: "#f4f2ed" },
      { id: "i4", type: "todo", x: 450, y: 195, w: 240, title: "Open with a surprising truth", body: "", color: "#fff" },
      { id: "i5", type: "todo", x: 450, y: 270, w: 240, title: "Tell one vivid personal story", body: "", color: "#fff", checked: true },
      { id: "i6", type: "todo", x: 450, y: 345, w: 240, title: "Give the viewer one action", body: "", color: "#fff" },
      { id: "i7", type: "column", x: 760, y: 110, w: 300, title: "VISUAL DIRECTION", body: "", color: "#f4f2ed" },
      { id: "i8", type: "note", x: 785, y: 195, w: 250, title: "Warm, human, unpolished", body: "Use your face, old photos, simple B-roll and a few AI-assisted visuals. Trust beats spectacle.", color: "#dbead8" },
      { id: "i9", type: "link", x: 785, y: 370, w: 250, title: "Reference: visual storytelling", body: "A useful link can live right on the board.", url: "https://www.youtube.com", color: "#fff" },
    ],
  },
  { id: "ideas", title: "Video idea bank", emoji: "💡", color: "#d5aa45", updated: Date.now() - 86_000_000, starred: false, items: [] },
  { id: "business", title: "Business research", emoji: "📊", color: "#557d72", updated: Date.now() - 172_000_000, starred: true, items: [] },
];

export default function Home() {
  const [boards, setBoards] = useState<Board[]>(starterBoards);
  const [active, setActive] = useState<string | null>(null);
  const [view, setView] = useState<View>("boards");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("loading");
  const [newTitle, setNewTitle] = useState("");
  const [loaded, setLoaded] = useState(false);
  useWebMCP(boards, (next) => setBoards(next as Board[]), active);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    const loadWorkspace = async () => {
      let localBoards: Board[] | null = null;
      const raw = localStorage.getItem("canvas-boards-v1");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Board[];
          if (Array.isArray(parsed)) localBoards = parsed;
        } catch {
          toast.error("Your browser backup could not be read.");
        }
      }

      try {
        const response = await fetch("/api/workspace", { cache: "no-store", headers: { "x-canvas-workspace-key": clientWorkspaceKey() } });
        if (!response.ok) throw new Error("Cloud workspace unavailable");
        const payload = await response.json() as { data: Board[] | null };
        if (cancelled) return;
        if (Array.isArray(payload.data)) {
          setBoards(payload.data);
        } else if (localBoards) {
          setBoards(localBoards);
          await fetch("/api/workspace", {
            method: "PUT", headers: { "content-type": "application/json", "x-canvas-workspace-key": clientWorkspaceKey() },
            body: JSON.stringify({ data: localBoards }),
          });
        }
        setSyncStatus("saved");
      } catch {
        if (!cancelled && localBoards) setBoards(localBoards);
        if (!cancelled) setSyncStatus("offline");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    loadWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem("canvas-boards-v1", JSON.stringify(boards));
    setSyncStatus("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT", headers: { "content-type": "application/json", "x-canvas-workspace-key": clientWorkspaceKey() },
          body: JSON.stringify({ data: boards }),
        });
        setSyncStatus(response.ok ? "saved" : "offline");
      } catch {
        setSyncStatus("offline");
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [boards, loaded]);

  const board = boards.find((candidate) => candidate.id === active);
  const updateBoard = (fn: (current: Board) => Board) => {
    setBoards((current) => current.map((candidate) =>
      candidate.id === active ? { ...fn(candidate), updated: Date.now() } : candidate
    ));
  };

  const addItem = (type: AddableCardType) => {
    const defaults: Record<AddableCardType, Partial<Item>> = {
      note: { title: "Untitled note", body: "Start typing…", color: "#fff3a8", w: 240 },
      todo: { title: "New task", body: "", color: "#fff", w: 240 },
      link: { title: "New link", body: "Add a description", url: "https://", color: "#fff", w: 250 },
      image: { title: "Image", body: "", image: "", color: "#fff", w: 260 },
      column: { title: "NEW COLUMN", body: "", color: "#f4f2ed", w: 285 },
    };
    const item = defaults[type];
    const count = board?.items.length ?? 0;
    updateBoard((current) => ({
      ...current,
      items: [...current.items, {
        id: uid(), type, x: 120 + (count % 4) * 270,
        y: 130 + Math.floor(count / 4) * 180, w: item.w!,
        title: item.title!, body: item.body!, color: item.color!,
        url: item.url, image: item.image,
      }],
    }));
  };

  const patchItem = (id: string, patch: Partial<Item>) => updateBoard((current) => ({
    ...current,
    items: current.items.map((item) => item.id === id ? { ...item, ...patch } : item),
  }));
  const removeItem = (id: string) => {
    const item = board?.items.find((candidate) => candidate.id === id);
    if (item?.storage === "cloud" && item.fileKey) {
      fetch(`/api/files?key=${encodeURIComponent(item.fileKey)}`, { method: "DELETE", headers: { "x-canvas-workspace-key": clientWorkspaceKey() } }).catch(() => undefined);
    } else if (item?.storage === "local" && item.fileKey) {
      deleteLocalFile(item.fileKey).catch(() => undefined);
    }
    updateBoard((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== id) }));
  };

  const chooseFiles = (files: File[]) => {
    const accepted = files.filter((file) => file.size <= 25 * 1024 * 1024).slice(0, 10);
    if (accepted.length !== files.length) toast.error("Choose up to 10 files, each no larger than 25 MB.");
    if (accepted.length) setPendingFiles(accepted);
  };

  const makeFileItem = (file: File, storage: "local" | "cloud", fileKey: string, url?: string, offset = 0): Item => {
    const count = (board?.items.length ?? 0) + offset;
    return {
      id: uid(), type: "file", x: 120 + (count % 4) * 270,
      y: 130 + Math.floor(count / 4) * 180, w: 270,
      title: file.name, body: "", color: "#ffffff", storage, fileKey,
      fileName: file.name, mime: file.type || "application/octet-stream",
      size: file.size, url,
    };
  };

  const savePendingFiles = async (destination: "local" | "cloud") => {
    if (!pendingFiles.length || !board) return;
    setUploading(true);
    const created: Item[] = [];
    try {
      for (const file of pendingFiles) {
        if (destination === "local") {
          const key = `local-${crypto.randomUUID()}`;
          await putLocalFile(key, file);
          created.push(makeFileItem(file, "local", key, undefined, created.length));
        } else {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch("/api/files", { method: "POST", headers: { "x-canvas-workspace-key": clientWorkspaceKey() }, body: form });
          const raw = await response.text();
          let payload: { key?: string; url?: string; error?: string } = {};
          try {
            payload = JSON.parse(raw);
          } catch {
            throw new Error(`Server returned ${response.status}: ${raw.slice(0, 200)}`);
          }
          if (!response.ok || !payload.key) {
            throw new Error(payload.error || `Upload failed (${response.status})`);
          }
          created.push(makeFileItem(file, "cloud", payload.key, payload.url, created.length));
        }
      }
      updateBoard((current) => ({ ...current, items: [...current.items, ...created] }));
      toast.success(`${created.length} file${created.length === 1 ? "" : "s"} saved ${destination === "cloud" ? "to cloud" : "on this browser"}`);
      setPendingFiles([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The files could not be saved");
    } finally {
      setUploading(false);
    }
  };

  const startDrag = (event: React.PointerEvent, item: Item) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left + canvasRef.current.scrollLeft) / zoom;
    const pointerY = (event.clientY - rect.top + canvasRef.current.scrollTop) / zoom;
    setDrag({ id: item.id, dx: pointerX - item.x, dy: pointerY - item.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveItem = (event: React.PointerEvent) => {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left + canvasRef.current.scrollLeft) / zoom - drag.dx;
    const y = (event.clientY - rect.top + canvasRef.current.scrollTop) / zoom - drag.dy;
    patchItem(drag.id, { x: Math.max(12, x), y: Math.max(12, y) });
  };

  const createBoard = () => {
    if (!newTitle.trim()) return;
    const created: Board = {
      id: uid(), title: newTitle.trim(), emoji: "✨", color: "#7d6dba",
      updated: Date.now(), starred: false, items: [],
    };
    setBoards((current) => [created, ...current]);
    setActive(created.id);
    setNewTitle("");
    setNewBoardOpen(false);
    toast.success("Board created");
  };

  const duplicateBoard = (id: string) => {
    const source = boards.find((candidate) => candidate.id === id);
    if (!source) return;
    const copy: Board = {
      ...source, id: uid(), title: `${source.title} copy`, updated: Date.now(),
      archived: false, items: source.items.map((item) => ({ ...item, id: uid() })),
    };
    setBoards((current) => [copy, ...current]);
    toast.success("Board duplicated");
  };

  const archiveBoard = (id: string, archived: boolean) => {
    setBoards((current) => current.map((candidate) =>
      candidate.id === id ? { ...candidate, archived, updated: Date.now() } : candidate
    ));
    if (active === id) setActive(null);
    toast.success(archived ? "Board moved to archive" : "Board restored");
  };

  const deleteBoard = (id: string) => {
    const target = boards.find((candidate) => candidate.id === id);
    if (!target || !window.confirm(`Delete “${target.title}”? This cannot be undone.`)) return;
    setBoards((current) => current.filter((candidate) => candidate.id !== id));
    if (active === id) setActive(null);
    toast.success("Board deleted");
  };

  const shareBoard = async () => {
    const shareData = {
      title: board?.title ?? "Canvas Boards",
      text: `View ${board?.title ?? "my workspace"} in Canvas Boards`,
      url: window.location.href,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Site link copied");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") toast.error("The link could not be shared");
    }
  };

  const exportWorkspace = () => {
    const blob = new Blob([JSON.stringify({ version: 1, boards }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `canvas-boards-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Workspace exported");
  };

  const importWorkspace = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { boards?: Board[] } | Board[];
      const imported = Array.isArray(parsed) ? parsed : parsed.boards;
      if (!Array.isArray(imported) || imported.some((entry) =>
        !entry.id || !entry.title || !Array.isArray(entry.items)
      )) throw new Error("Invalid workspace");
      setBoards(imported);
      setActive(null);
      toast.success(`${imported.length} board${imported.length === 1 ? "" : "s"} imported`);
    } catch {
      toast.error("That file is not a valid Canvas Boards export");
    }
  };

  const visibleBoards = useMemo(() => boards.filter((candidate) => {
    const matchesView = view === "archive"
      ? candidate.archived
      : !candidate.archived && (view !== "starred" || candidate.starred);
    return matchesView && candidate.title.toLowerCase().includes(query.toLowerCase());
  }), [boards, query, view]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };
  const fitCanvas = () => {
    const width = canvasRef.current?.clientWidth ?? 1200;
    setZoom(Math.max(0.5, Math.min(1, (width - 110) / 1150)));
  };

  return (
    <TooltipProvider>
      {active && board ? (
        <div className="app-shell">
          <header className="topbar">
            <div className="top-left">
              <Button aria-label="Back to boards" variant="ghost" size="icon" onClick={() => setActive(null)}><ArrowLeft /></Button>
              <span className="brand-mark">C</span>
              <button className="board-title" onClick={() => setSettingsOpen(true)}>{board.emoji} {board.title}</button>
              <Button aria-label={board.starred ? "Remove from starred" : "Add to starred"} variant="ghost" size="icon" onClick={() => updateBoard((current) => ({ ...current, starred: !current.starred }))}><Star className={board.starred ? "starred" : ""} /></Button>
            </div>
            <div className="top-actions">
              <span className={`saved ${syncStatus}`} title="Board details sync online; browser-only files remain on this device">
                {syncStatus === "saving" ? <Loader2 className="spin" /> : syncStatus === "offline" ? <HardDrive /> : <Check />}
                {syncStatus === "saving" ? "Saving…" : syncStatus === "offline" ? "Browser backup" : "Synced"}
              </span>
              <Button variant="outline" onClick={shareBoard}><Share2 /> Share link</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button aria-label="Board actions" variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}><Pencil /> Rename board</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateBoard(board.id)}><Copy /> Duplicate board</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    if (window.confirm("Remove every item from this board?")) {
                      updateBoard((current) => ({ ...current, items: [] }));
                    }
                  }}><Trash2 /> Clear board</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => archiveBoard(board.id, true)}><Archive /> Archive board</DropdownMenuItem>
                  <DropdownMenuItem className="danger" onClick={() => deleteBoard(board.id)}><Trash2 /> Delete board</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <aside className="toolrail" aria-label="Board tools">
            <Tool icon={<MousePointer2 />} label="Select" active />
            <Tool icon={<FileText />} label="Note" onClick={() => addItem("note")} />
            <Tool icon={<CheckSquare />} label="Task" onClick={() => addItem("todo")} />
            <Tool icon={<Link2 />} label="Link" onClick={() => addItem("link")} />
            <Tool icon={<ImageIcon />} label="Image" onClick={() => addItem("image")} />
            <Tool icon={<Paperclip />} label="File" onClick={() => fileRef.current?.click()} />
            <Tool icon={<Columns3 />} label="Column" onClick={() => addItem("column")} />
            <div className="rail-spacer" />
            <Tool icon={<CircleHelp />} label="Help" onClick={() => setHelpOpen(true)} />
          </aside>

          <main
            className={`canvas-wrap ${dropActive ? "drop-active" : ""}`} ref={canvasRef} onPointerMove={moveItem}
            onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}
            onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={(event) => {
              if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setDropActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              chooseFiles(Array.from(event.dataTransfer.files));
            }}
          >
            {dropActive && <div className="drop-overlay"><div><Upload /><strong>Drop files on this board</strong><span>You’ll choose browser or cloud storage next</span></div></div>}
            {board.items.length === 0 && (
              <div className="empty-canvas">
                <div className="empty-icon"><Sparkles /></div>
                <h2>Start shaping your ideas</h2>
                <p>Add a note, task, link, image or file—or drag files here.</p>
                <Button onClick={() => addItem("note")}><Plus /> Add your first note</Button>
              </div>
            )}
            <div className="canvas" style={{ transform: `scale(${zoom})`, height: board.items.reduce((tallest, entry) => Math.max(tallest, entry.y + (entry.h ?? 240) + 140), 1200) }}>
              {board.items.map((item) => (
                <BoardItem
                  key={item.id} item={item}
                  patch={(patch) => patchItem(item.id, patch)}
                  remove={() => removeItem(item.id)}
                  startDrag={(event) => startDrag(event, item)}
                />
              ))}
            </div>
          </main>

          <div className="zoom-controls">
            <Button aria-label="Zoom out" variant="ghost" size="icon" onClick={() => setZoom((current) => Math.max(0.5, current - 0.1))}><ZoomOut /></Button>
            <button aria-label="Reset zoom" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <Button aria-label="Zoom in" variant="ghost" size="icon" onClick={() => setZoom((current) => Math.min(1.5, current + 0.1))}><ZoomIn /></Button>
            <Button aria-label="Fit board" title="Fit board" variant="ghost" size="icon" onClick={fitCanvas}><Columns3 /></Button>
            <Button aria-label="Toggle fullscreen" title="Fullscreen" variant="ghost" size="icon" onClick={toggleFullscreen}><Maximize2 /></Button>
          </div>
        </div>
      ) : (
        <Dashboard
          boards={visibleBoards} allBoards={boards} view={view} setView={setView}
          query={query} setQuery={setQuery} open={setActive}
          newBoard={() => setNewBoardOpen(true)}
          toggleStar={(id) => setBoards((current) => current.map((candidate) =>
            candidate.id === id ? { ...candidate, starred: !candidate.starred } : candidate
          ))}
          duplicate={duplicateBoard} archive={archiveBoard} remove={deleteBoard}
          exportWorkspace={exportWorkspace}
          importWorkspace={() => importRef.current?.click()}
          help={() => setHelpOpen(true)}
        />
      )}

      <input ref={importRef} className="file-input" type="file" accept="application/json,.json" onChange={importWorkspace} />
      <input ref={fileRef} className="file-input" type="file" multiple onChange={(event) => { chooseFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <Dialog open={newBoardOpen} onOpenChange={setNewBoardOpen}>
        <DialogContent showCloseButton={false}>
          <button className="modal-close" type="button" aria-label="Close create-board dialog" onClick={() => setNewBoardOpen(false)}><X /></button>
          <DialogHeader>
            <DialogTitle>Create a new board</DialogTitle>
            <DialogDescription>Start with a clear, flexible canvas.</DialogDescription>
          </DialogHeader>
          <div className="dialog-form">
            <label htmlFor="board-name">Board name</label>
            <Input id="board-name" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createBoard()} placeholder="e.g. Next video plan" />
            <div className="dialog-actions"><Button variant="outline" onClick={() => setNewBoardOpen(false)}>Cancel</Button><Button onClick={createBoard}>Create board</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent showCloseButton={false}>
          <button className="modal-close" type="button" aria-label="Close board settings" onClick={() => setSettingsOpen(false)}><X /></button>
          <DialogHeader>
            <DialogTitle>Board settings</DialogTitle>
            <DialogDescription>Board details sync online. Browser-only files stay on this device.</DialogDescription>
          </DialogHeader>
          {board && (
            <div className="dialog-form board-settings">
              <label htmlFor="board-emoji">Icon</label>
              <Input id="board-emoji" maxLength={4} value={board.emoji} onChange={(event) => updateBoard((current) => ({ ...current, emoji: event.target.value }))} />
              <label htmlFor="board-title">Board name</label>
              <Input id="board-title" value={board.title} onChange={(event) => updateBoard((current) => ({ ...current, title: event.target.value }))} />
              <div className="dialog-actions"><Button onClick={() => setSettingsOpen(false)}>Done</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={pendingFiles.length > 0} onOpenChange={(open) => { if (!open && !uploading) setPendingFiles([]); }}>
        <DialogContent className="storage-dialog" showCloseButton={false}>
          <button className="modal-close" type="button" aria-label="Cancel file upload" disabled={uploading} onClick={() => setPendingFiles([])}><X /></button>
          <DialogHeader>
            <DialogTitle>Where should these files live?</DialogTitle>
            <DialogDescription>Choose separately each time you drop or select files.</DialogDescription>
          </DialogHeader>
          <div className="pending-files">
            {pendingFiles.slice(0, 4).map((file) => <div key={`${file.name}-${file.lastModified}`}><Paperclip /><span>{file.name}</span><small>{formatBytes(file.size)}</small></div>)}
            {pendingFiles.length > 4 && <p>+ {pendingFiles.length - 4} more</p>}
          </div>
          <div className="storage-choices">
            <button disabled={uploading} onClick={() => savePendingFiles("local")}><HardDrive /><span><strong>This browser</strong><small>Private to this device</small></span></button>
            <button disabled={uploading} onClick={() => savePendingFiles("cloud")}><Cloud /><span><strong>Cloud</strong><small>Available on your other devices</small></span></button>
          </div>
          {uploading && <div className="upload-progress"><Loader2 className="spin" /> Saving files…</div>}
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="help-dialog" showCloseButton={false}>
          <button className="modal-close" type="button" aria-label="Close help" onClick={() => setHelpOpen(false)}><X /></button>
          <DialogHeader>
            <DialogTitle>Canvas Boards help</DialogTitle>
            <DialogDescription>Five quick steps to organize your ideas.</DialogDescription>
          </DialogHeader>
          <ol className="help-steps">
            <li><span>1</span><div><strong>Create or open a board</strong><p>Use New board on the dashboard, or select one of the example boards.</p></div></li>
            <li><span>2</span><div><strong>Add content</strong><p>Choose Note, Task, Link, Image or Column from the toolbar on the left.</p></div></li>
            <li><span>3</span><div><strong>Arrange and edit</strong><p>Drag an item by its dotted top handle. Click directly into its title, text or web address to edit it.</p></div></li>
            <li><span>4</span><div><strong>Add files</strong><p>Drag files from your computer onto the board, or choose File. You decide whether each batch stays in this browser or uploads to cloud storage.</p></div></li>
            <li><span>5</span><div><strong>Keep a backup</strong><p>Board details sync online and keep a browser backup. Export workspace downloads an extra copy of the board structure.</p></div></li>
          </ol>
          <div className="dialog-actions"><Button type="button" onClick={() => setHelpOpen(false)}>Close help</Button></div>
        </DialogContent>
      </Dialog>
      <Toaster position="bottom-center" richColors />
    </TooltipProvider>
  );
}

function Tool({ icon, label, onClick, active }: {
  icon: React.ReactNode; label: string; onClick?: () => void; active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className={`tool ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function normaliseUrl(value: string) {
  if (!value.trim()) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function BoardItem({ item, patch, remove, startDrag }: {
  item: Item; patch: (patch: Partial<Item>) => void;
  remove: () => void; startDrag: (event: React.PointerEvent) => void;
}) {
  return (
    <article className={`board-item ${item.type}`} style={{ left: item.x, top: item.y, width: item.w, background: item.color, ...(item.h ? { minHeight: item.h } : {}) }}>
      <div className="item-grab" onPointerDown={startDrag} aria-label="Drag item"><span /><span /><span /><span /></div>
      <div className="item-actions">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button aria-label="Item actions"><MoreHorizontal /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {palette.map((color) => <DropdownMenuItem key={color} onClick={() => patch({ color })}><span className="swatch" style={{ background: color }} /> Use this color</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={remove} className="danger"><Trash2 /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {item.type === "todo" && <button aria-label={item.checked ? "Mark incomplete" : "Mark complete"} className={`check ${item.checked ? "done" : ""}`} onClick={() => patch({ checked: !item.checked })}>{item.checked && <Check />}</button>}
      {item.type === "image" && (item.image
        ? <img src={normaliseUrl(item.image)} alt={item.title || "Board reference"} />
        : <div className="image-placeholder"><ImageIcon /><span>Paste an image URL below</span></div>
      )}
      {item.type === "file" && <FileAttachment item={item} />}
      {item.type !== "file" && <Input aria-label="Item title" className="item-title" value={item.title} onChange={(event) => patch({ title: event.target.value })} />}
      {item.type !== "todo" && item.type !== "column" && item.type !== "file" && <Textarea aria-label="Item text" className="item-body" value={item.body} onChange={(event) => patch({ body: event.target.value })} />}
      {item.type === "link" && (
        <div className="url-row">
          <Input aria-label="Web address" className="item-url" value={item.url ?? ""} onChange={(event) => patch({ url: event.target.value })} />
          <button aria-label="Open link" disabled={!item.url || item.url === "https://"} onClick={() => window.open(normaliseUrl(item.url ?? ""), "_blank", "noopener,noreferrer")}><ExternalLink /></button>
        </div>
      )}
      {item.type === "image" && <Input aria-label="Image address" className="item-url" value={item.image ?? ""} onChange={(event) => patch({ image: event.target.value })} placeholder="https://…" />}
    </article>
  );
}

function openFileDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("canvas-boards-files", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putLocalFile(key: string, file: File) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").put(file, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getLocalFile(key: string) {
  const db = await openFileDb();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction("files", "readonly").objectStore("files").get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return file;
}

async function deleteLocalFile(key: string) {
  const db = await openFileDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function FileAttachment({ item }: { item: Item }) {
  const [source, setSource] = useState(item.storage === "cloud" ? item.url ?? "" : "");
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (item.storage !== "local" || !item.fileKey) return;
    let objectUrl = "";
    getLocalFile(item.fileKey).then((file) => {
      if (!file) {
        setMissing(true);
        return;
      }
      objectUrl = URL.createObjectURL(file);
      setSource(objectUrl);
    }).catch(() => setMissing(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [item.fileKey, item.storage]);

  const isImage = item.mime?.startsWith("image/");
  return (
    <div className="file-attachment">
      {isImage && source ? <img className="file-preview" src={source} alt={item.fileName || "Uploaded file"} /> : <div className="file-icon"><Paperclip /></div>}
      <strong title={item.fileName}>{item.fileName || item.title}</strong>
      <div className="file-meta"><span className={item.storage === "cloud" ? "cloud" : "local"}>{item.storage === "cloud" ? <Cloud /> : <HardDrive />}{item.storage === "cloud" ? "Cloud" : "This browser"}</span><small>{formatBytes(item.size ?? 0)}</small></div>
      {missing ? <p className="file-missing">This browser-only file lives on another device.</p> : source ? <a href={source} target="_blank" rel="noreferrer" download={item.fileName}><ExternalLink /> Open or download</a> : <p className="file-loading"><Loader2 className="spin" /> Loading file…</p>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function Dashboard({
  boards, allBoards, view, setView, query, setQuery, open, newBoard,
  toggleStar, duplicate, archive, remove, exportWorkspace, importWorkspace, help,
}: {
  boards: Board[]; allBoards: Board[]; view: View; setView: (view: View) => void;
  query: string; setQuery: (query: string) => void; open: (id: string) => void;
  newBoard: () => void; toggleStar: (id: string) => void;
  duplicate: (id: string) => void; archive: (id: string, archived: boolean) => void;
  remove: (id: string) => void; exportWorkspace: () => void;
  importWorkspace: () => void; help: () => void;
}) {
  const title = view === "starred" ? "Starred boards" : view === "archive" ? "Archive" : "Boards";
  const activeCount = allBoards.filter((board) => !board.archived).length;
  return (
    <div className="dashboard">
      <aside className="dash-side">
        <div className="logo"><span>C</span>Canvas</div>
        <nav aria-label="Workspace views">
          <button className={view === "boards" ? "selected" : ""} onClick={() => setView("boards")}><LayoutDashboard /> Boards <small>{activeCount}</small></button>
          <button className={view === "starred" ? "selected" : ""} onClick={() => setView("starred")}><Star /> Starred</button>
          <button className={view === "archive" ? "selected" : ""} onClick={() => setView("archive")}><Archive /> Archive</button>
        </nav>
        <div className="side-bottom">
          <button onClick={importWorkspace}><Upload /> Import workspace</button>
          <button onClick={exportWorkspace}><Download /> Export workspace</button>
          <button onClick={help}><CircleHelp /> Help</button>
          <div className="profile"><span>S</span><div><strong>Sputnik</strong><small>Personal workspace</small></div><ChevronDown /></div>
        </div>
      </aside>
      <main className="dash-main">
        <header>
          <div><p className="eyebrow">YOUR WORKSPACE</p><h1>Good afternoon</h1><p>Pick up where you left off, or start something new.</p></div>
          <Button onClick={newBoard}><Plus /> New board</Button>
        </header>
        <div className="search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your boards" /></div>
        <section>
          <div className="section-title"><h2>{title}</h2><span>{boards.length} board{boards.length === 1 ? "" : "s"}</span></div>
          <div className="board-grid">
            {view === "boards" && !query && <button className="new-card" onClick={newBoard}><div><Plus /></div><strong>Create a new board</strong><span>Begin with a blank canvas</span></button>}
            {boards.map((board) => (
              <article className="board-card" key={board.id} onClick={() => open(board.id)} tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") open(board.id); }}>
                <div className="board-preview" style={{ background: `linear-gradient(145deg,${board.color},#f2eee6)` }}>
                  <span>{board.emoji}</span><div className="mini-note one" /><div className="mini-note two" /><div className="mini-note three" />
                  <div className="board-card-actions">
                    <button aria-label={board.starred ? "Remove from starred" : "Add to starred"} onClick={(event) => { event.stopPropagation(); toggleStar(board.id); }}><Star className={board.starred ? "starred" : ""} /></button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><button aria-label="Board actions" onClick={(event) => event.stopPropagation()}><MoreHorizontal /></button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenuItem onClick={() => duplicate(board.id)}><Copy /> Duplicate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archive(board.id, !board.archived)}>{board.archived ? <ArchiveRestore /> : <Archive />} {board.archived ? "Restore" : "Archive"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="danger" onClick={() => remove(board.id)}><Trash2 /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="board-meta"><strong>{board.title}</strong><small>{formatEdited(board.updated)}</small></div>
              </article>
            ))}
          </div>
          {boards.length === 0 && <div className="empty-list"><Search /><h3>No boards found</h3><p>{query ? "Try a different search." : view === "archive" ? "Archived boards will appear here." : "Star a board to keep it close."}</p></div>}
        </section>
      </main>
    </div>
  );
}

function formatEdited(updated: number) {
  const days = Math.max(0, Math.round((Date.now() - updated) / 86_400_000));
  if (days === 0) return "Edited today";
  if (days === 1) return "Edited yesterday";
  return `Edited ${days} days ago`;
}
