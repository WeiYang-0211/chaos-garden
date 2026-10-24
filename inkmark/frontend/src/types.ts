export type FontSpec = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  tags: string[];
  license: string;
  license_url: string;
  script: string;
  weight: string;
  available: boolean;
  sample_url: string;
};

export type PaperSpec = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  kind: string;
  ratio: number;
  photo: boolean;
  printable: boolean;
  badge: string;
  thumbnail_url: string;
};

export type Ink = { id: string; name: string; value: string };

export type Settings = {
  font_size: number;
  line_spacing: number;
  messiness: number;
  stroke_random: number;
  mistake_rate: number;
  slant: number;
  ink: string;
};

export type Sample = { label: string; text: string };

export type Catalog = {
  fonts: FontSpec[];
  papers: PaperSpec[];
  inks: Ink[];
  defaults: Settings;
  ranges: Record<string, [number, number]>;
  limits: {
    max_chars: number;
    max_pages: number;
    max_upload_mb: number;
    preview_width: number;
    export_dpi: number[];
  };
  samples: Sample[];
  preview_width: number;
  version: string;
};

export type ExportRecord = {
  id: string;
  format: "zip" | "pdf";
  dpi: number;
  image_format: "jpg" | "png";
  status: "queued" | "rendering" | "packaging" | "ready" | "failed";
  progress: number;
  phase: string;
  filename: string;
  size_bytes: number;
  error: string;
  file_url?: string;
};

export type Job = {
  id: string;
  title: string;
  source_type: string;
  source_name: string;
  font_id: string;
  paper_id: string;
  settings: Settings;
  seed: number;
  status: "queued" | "processing" | "rendering" | "ready" | "failed";
  phase: string;
  progress: number;
  error: string;
  warning: string;
  page_count: number;
  char_count: number;
  unsupported: number;
  preview_urls: string[];
  exports: Record<string, ExportRecord>;
  created_at: string;
  updated_at: string;
  text?: string;
};

export type CreateJobInput = {
  mode: "text" | "file";
  text: string;
  title: string;
  fontId: string;
  paperId: string;
  settings: Settings;
  seed: number;
  file: File | null;
};
