import { StaticPreview } from "./view-mode";

export function PageHeading({ title, description, preview = true }: { title: string; description?: string; preview?: boolean }) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {preview && <span className="preview-tag"><StaticPreview fallback="No live data yet">Static preview</StaticPreview></span>}
    </header>
  );
}
