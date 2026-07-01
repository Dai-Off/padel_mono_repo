import { useRef, useState, useEffect } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { uploadStoreProductImage } from '../../services/store';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_MB = 5;

type ProductImageUploadProps = {
    value: string;
    onChange: (url: string) => void;
    disabled?: boolean;
    onError?: (message: string) => void;
    onUploadingChange?: (uploading: boolean) => void;
    uploadFile?: (file: File) => Promise<string>;
};

export function ProductImageUpload({
    value,
    onChange,
    disabled,
    onError,
    onUploadingChange,
    uploadFile: uploadFileProp,
}: ProductImageUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [previewBroken, setPreviewBroken] = useState(false);

    useEffect(() => {
        setPreviewBroken(false);
    }, [value]);

    const uploadFile = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            onError?.('Solo se permiten imágenes JPEG, PNG o WebP');
            return;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            onError?.(`La imagen no puede superar ${MAX_MB} MB`);
            return;
        }
        setUploading(true);
        onUploadingChange?.(true);
        try {
            const url = await (uploadFileProp ?? uploadStoreProductImage)(file);
            onChange(url);
        } catch (err) {
            onError?.(err instanceof Error ? err.message : 'No se pudo subir la imagen');
        } finally {
            setUploading(false);
            onUploadingChange?.(false);
        }
    };

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) void uploadFile(file);
    };

    const handleDrop = (event: React.DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        if (disabled || uploading) return;
        handleFiles(event.dataTransfer.files);
    };

    return (
        <div className="flex flex-col gap-2">
            <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={disabled || uploading}
                onChange={(e) => {
                    handleFiles(e.target.files);
                    e.target.value = '';
                }}
            />

            <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!disabled && !uploading) inputRef.current?.click();
                    }
                }}
                onClick={() => {
                    if (!disabled && !uploading) inputRef.current?.click();
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!disabled && !uploading) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={[
                    'relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition',
                    dragOver
                        ? 'border-auth-accent/60 bg-auth-accent/10'
                        : 'border-auth-border bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                    (disabled || uploading) ? 'pointer-events-none opacity-60' : '',
                ].join(' ')}
            >
                {value && !previewBroken ? (
                    <>
                        <img
                            src={value}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={() => {
                                setPreviewBroken(true);
                                onError?.('La imagen no carga. Subí otra foto.');
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-2 p-3">
                            <span className="truncate text-xs font-medium text-white/90">Imagen cargada</span>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange('');
                                }}
                                disabled={disabled || uploading}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/50 text-white/90 transition hover:bg-red-500/80"
                                aria-label="Quitar imagen"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </>
                ) : value && previewBroken ? (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                        <p className="text-sm font-medium text-red-300">Imagen rota</p>
                        <p className="text-xs text-auth-secondary">Elegí otra foto para publicar</p>
                    </div>
                ) : uploading ? (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-auth-accent" />
                        <p className="text-sm font-medium text-auth-text">Subiendo…</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 px-4 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-auth-accent/15 text-auth-accent">
                            <ImagePlus className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-auth-text">Arrastrá o elegí una foto</p>
                            <p className="mt-1 text-xs text-auth-secondary">JPEG, PNG o WebP · máx. {MAX_MB} MB</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-auth-border bg-white/5 px-3 py-1 text-xs text-auth-muted">
                            <Upload className="h-3.5 w-3.5" />
                            Examinar archivos
                        </span>
                    </div>
                )}
            </div>

            <p className="text-xs leading-relaxed text-auth-secondary">
                Se guarda en Supabase Storage (bucket <span className="text-auth-muted">store-products</span>).
            </p>
        </div>
    );
}
