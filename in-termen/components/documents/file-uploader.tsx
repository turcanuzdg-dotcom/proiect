"use client";

import { FileText, LoaderCircle, Lock, RefreshCw, Trash, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { discardUpload } from "@/lib/actions/documents";
import { maxUploadBytes } from "@/lib/config";
import { cn } from "@/lib/utils/cn";
import { ACCEPT_ATTRIBUTE, formatFileSize, validateFile } from "@/lib/utils/files";
import { uploadDocumentFile, UploadError } from "@/lib/upload-client";
import type { UploadedFileRef } from "@/types/domain";

interface FileUploaderProps {
  value: UploadedFileRef | null;
  onChange: (file: UploadedFileRef | null) => void;
  /** Fișierul deja salvat al documentului (la editare); nu se șterge din Storage la „Elimină”. */
  savedPath?: string | null;
  onUploadingChange?: (uploading: boolean) => void;
}

type State =
  { kind: "idle" } | { kind: "uploading"; progress: number; name: string } | { kind: "error"; message: string };

export function FileUploader({ value, onChange, savedPath, onUploadingChange }: FileUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [localSize, setLocalSize] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function setUploading(uploading: boolean) {
    onUploadingChange?.(uploading);
  }

  async function handleFile(file: File) {
    const check = validateFile(file, maxUploadBytes);
    if (!check.ok) {
      setState({ kind: "error", message: check.error });
      return;
    }

    const previous = value;
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ kind: "uploading", progress: 0, name: file.name });
    setUploading(true);

    try {
      const uploaded = await uploadDocumentFile(
        file,
        (progress) => setState({ kind: "uploading", progress, name: file.name }),
        controller.signal,
      );
      setPreviewUrl(check.mimeType.startsWith("image/") ? URL.createObjectURL(file) : null);
      setLocalSize(file.size);
      onChange(uploaded);
      setState({ kind: "idle" });
      // Fișierul înlocuit (încărcat acum, nesalvat încă) nu mai este necesar.
      if (previous && previous.path !== savedPath) void discardUpload(previous.path);
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof UploadError ? error.message : "Încărcarea nu a reușit. Încearcă din nou.",
      });
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  }

  function remove() {
    if (value && value.path !== savedPath) void discardUpload(value.path);
    onChange(null);
    setPreviewUrl(null);
    setLocalSize(null);
    setState({ kind: "idle" });
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  const hint = `PDF, JPG sau PNG, cel mult ${formatFileSize(maxUploadBytes)}.`;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />

      {state.kind === "uploading" ? (
        <div className="border-border bg-subtle rounded-2xl border p-5" aria-live="polite">
          <div className="flex items-center gap-3">
            <LoaderCircle className="text-primary size-5 animate-spin" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{state.name}</p>
              <p className="text-muted-foreground text-[13px]">Se încarcă… {state.progress}%</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
              Anulează
            </Button>
          </div>
          <Progress value={state.progress} label="Progresul încărcării" className="mt-3" />
        </div>
      ) : value ? (
        <div className="border-border bg-surface overflow-hidden rounded-2xl border">
          {previewUrl ? (
            // Previzualizare locală (blob:), înainte de salvare.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Previzualizare: ${value.name}`}
              className="bg-subtle max-h-72 w-full object-contain"
            />
          ) : (
            <div className="bg-subtle flex h-32 items-center justify-center">
              <FileText className="text-primary size-10" strokeWidth={1.5} aria-hidden />
            </div>
          )}
          <div className="border-border flex flex-wrap items-center gap-3 border-t p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{value.name}</p>
              <p className="text-muted-foreground text-[13px]">
                {value.mimeType === "application/pdf" ? "PDF" : "Imagine"}
                {localSize ? ` · ${formatFileSize(localSize)}` : ""} · păstrat privat
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <RefreshCw aria-hidden />
              Înlocuiește
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} aria-label={`Elimină fișierul ${value.name}`}>
              <Trash aria-hidden />
              Elimină
            </Button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "focus-within:border-ring flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging
              ? "border-ring bg-primary-soft"
              : "border-input bg-subtle hover:bg-muted/60 hover:border-[#9aa7b8]",
          )}
        >
          <span
            className="bg-surface text-primary shadow-card flex size-12 items-center justify-center rounded-2xl"
            aria-hidden
          >
            <Upload className="size-6" strokeWidth={1.75} />
          </span>
          <span className="mt-4 text-[15px] font-medium">Fotografiază sau alege un fișier</span>
          <span className="text-muted-foreground mt-1 text-[13px]">Sau trage fișierul aici. {hint}</span>
        </label>
      )}

      {state.kind === "error" ? (
        <p role="alert" className="text-destructive text-[13px] font-medium">
          {state.message}
        </p>
      ) : null}

      <p className="text-muted-foreground flex items-start gap-1.5 text-[13px] leading-snug">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Fișierul se păstrează într-un spațiu privat. Doar tu îl poți deschide.
      </p>
    </div>
  );
}
