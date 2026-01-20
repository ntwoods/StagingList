import { useEffect, useMemo, useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isPdf(file) {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

export default function UploadModal({
  open,
  title,
  subtitle,
  onClose,
  onSubmit,
  loading
}) {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setError("");
    }
  }, [open]);

  const fileCountLabel = useMemo(() => {
    if (files.length === 0) return "No files selected";
    return `${files.length} file${files.length > 1 ? "s" : ""} selected`;
  }, [files]);

  const handleFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    event.target.value = "";

    if (!nextFiles.length) return;

    const validFiles = [];
    const errors = [];

    nextFiles.forEach((file) => {
      if (!isPdf(file)) {
        errors.push(`${file.name} is not a PDF.`);
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        errors.push(`${file.name} exceeds 10MB.`);
        return;
      }

      validFiles.push(file);
    });

    if (errors.length) {
      setError(errors.join(" "));
    } else {
      setError("");
    }

    if (validFiles.length) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleRemove = (index) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    if (!files.length) {
      setError("Please select at least one PDF.");
      return;
    }

    setError("");
    await onSubmit(files);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="upload-drop">
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileChange}
              disabled={loading}
            />
            <span>Choose one or more PDFs</span>
            <small>{fileCountLabel}</small>
          </div>

          {files.length ? (
            <div className="file-chips">
              {files.map((file, index) => (
                <div className="file-chip" key={`${file.name}-${index}`}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => handleRemove(index)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Uploading..." : "Upload PDFs"}
          </button>
        </div>
      </div>
    </div>
  );
}
