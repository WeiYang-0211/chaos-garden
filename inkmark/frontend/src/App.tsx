import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { getCatalog, getJob, createJob } from "./api";
import type { Catalog, Job, Settings } from "./types";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Hero } from "./components/Hero";
import { InputPanel } from "./components/InputPanel";
import { FontPicker } from "./components/FontPicker";
import { PaperPicker } from "./components/PaperPicker";
import { Controls } from "./components/Controls";
import { PreviewPanel } from "./components/PreviewPanel";
import { DownloadDialog } from "./components/DownloadDialog";
import { TextDialog } from "./components/TextDialog";
import { GuideDialog } from "./components/GuideDialog";
import { Toast } from "./components/Toast";

const fallbackSettings: Settings = {
  font_size: 1,
  line_spacing: 1,
  messiness: 6,
  stroke_random: 5,
  mistake_rate: 3,
  slant: 0,
  ink: "#1f1e1b",
};

const randomSeed = () => Math.floor(Math.random() * 2_000_000_000) + 1;

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fontId, setFontId] = useState("xiaolai");
  const [paperId, setPaperId] = useState("notebook");
  const [settings, setSettings] = useState<Settings>(fallbackSettings);
  const [seed, setSeed] = useState(randomSeed);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [activeNav, setActiveNav] = useState("studio");
  const [toast, setToast] = useState<{ message: string; tone: "info" | "success" | "error" } | null>(null);
  const initialized = useRef(false);
  const failedToast = useRef<string | null>(null);

  const notify = useCallback((message: string, tone: "info" | "success" | "error" = "info") => {
    setToast({ message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    getCatalog()
      .then((data) => {
        setCatalog(data);
        if (initialized.current) return;
        initialized.current = true;
        setSettings(data.defaults ?? fallbackSettings);
        setFontId(data.fonts.find((font) => font.id === "xiaolai")?.id ?? data.fonts[0]?.id ?? "xiaolai");
        setPaperId(data.papers.find((paper) => paper.id === "notebook")?.id ?? data.papers[0]?.id ?? "notebook");
        setText(data.samples?.[0]?.text ?? "");
      })
      .catch((error) => setCatalogError(error instanceof Error ? error.message : "无法加载字体与纸张"));
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await getJob(jobId, true);
        if (!active) return;
        setJob(next);
        if (next.status === "ready") {
          setDirty(false);
          failedToast.current = null;
        } else if (next.status === "failed") {
          if (failedToast.current !== next.id) {
            failedToast.current = next.id;
            notify(next.error || "生成失败，请重试。", "error");
          }
        } else {
          timer = window.setTimeout(tick, 700);
        }
      } catch (error) {
        if (!active) return;
        notify(error instanceof Error ? error.message : "查询任务失败", "error");
      }
    };
    tick();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [jobId, notify]);

  const font = useMemo(() => catalog?.fonts.find((item) => item.id === fontId), [catalog, fontId]);
  const paper = useMemo(() => catalog?.papers.find((item) => item.id === paperId), [catalog, paperId]);
  const generating = submitting || (job ? !["ready", "failed"].includes(job.status) : false);
  const maxChars = catalog?.limits.max_chars ?? 20000;

  const markDirty = () => {
    if (jobId) setDirty(true);
  };

  async function submitJob(overrides?: {
    text?: string;
    mode?: "text" | "file";
    file?: File | null;
    seed?: number;
  }) {
    const nextMode = overrides?.mode ?? mode;
    const nextText = overrides?.text ?? text;
    const nextFile = overrides?.file ?? file;
    const nextSeed = overrides?.seed ?? seed;

    if (nextMode === "text" && !nextText.trim()) {
      notify("先写一点文字，再生成手迹。", "error");
      return;
    }
    if (nextMode === "file" && !nextFile) {
      notify("请选择一个要转换的文件。", "error");
      return;
    }
    if (nextText.length > maxChars) {
      notify(`文字超过 ${maxChars.toLocaleString("zh-CN")} 字，请删减后再生成。`, "error");
      return;
    }

    setSubmitting(true);
    setDirty(false);
    setPage(0);
    setJob(null);
    setJobId(null);
    setSeed(nextSeed);
    try {
      const result = await createJob({
        mode: nextMode,
        text: nextText,
        title: nextMode === "file" ? (nextFile?.name ?? "") : nextText.split("\n").find((line) => line.trim())?.slice(0, 60) ?? "",
        fontId,
        paperId,
        settings,
        seed: nextSeed,
        file: nextMode === "file" ? nextFile : null,
      });
      setJobId(result.job_id);
      setSeed(result.seed);
      notify("开始落笔，正在生成预览…", "info");
    } catch (error) {
      notify(error instanceof Error ? error.message : "生成失败，请重试。", "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGenerate() {
    void submitJob();
  }

  function handleReroll() {
    const nextSeed = randomSeed();
    setSeed(nextSeed);
    if (job?.status === "ready") {
      void submitJob({ seed: nextSeed });
    } else {
      notify("换了一个随机种子，生成时会生效。", "info");
    }
  }

  function handleUseText(nextText: string) {
    setTextOpen(false);
    setMode("text");
    setText(nextText);
    setFile(null);
    void submitJob({ text: nextText, mode: "text", file: null });
  }

  function handleNavigate(id: string) {
    setActiveNav(id);
    setMobileNav(false);
    const target = document.getElementById(id);
    if (target) {
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 88, behavior: "smooth" });
    }
  }

  return (
    <div className="app-shell">
      <div className={`mobile-scrim ${mobileNav ? "show" : ""}`} onClick={() => setMobileNav(false)} />
      <div className={`sidebar-wrap ${mobileNav ? "open" : ""}`}>
        <Sidebar active={activeNav} onNavigate={handleNavigate} onGuide={() => setGuideOpen(true)} />
      </div>

      <main className="main">
        <Topbar
          onMenu={() => setMobileNav((value) => !value)}
          fontCount={catalog?.fonts.length ?? 8}
          paperCount={catalog?.papers.length ?? 11}
        />

        {catalogError ? (
          <div className="load-error">
            <AlertCircle size={20} />
            <div>
              <strong>没有连上后端</strong>
              <p>{catalogError}。请确认本地服务在 8420 端口运行。</p>
            </div>
          </div>
        ) : (
          <div className="workspace">
            <Hero />

            <section className="studio" id="studio">
              <InputPanel
                mode={mode}
                onMode={(next) => {
                  setMode(next);
                  markDirty();
                }}
                text={text}
                onText={(next) => {
                  setText(next);
                  markDirty();
                }}
                file={file}
                onFile={(next) => {
                  setFile(next);
                  markDirty();
                }}
                samples={catalog?.samples ?? []}
                maxChars={maxChars}
                onError={(message) => notify(message, "error")}
              />

              <FontPicker
                fonts={catalog?.fonts ?? []}
                selected={fontId}
                onSelect={(next) => {
                  setFontId(next);
                  markDirty();
                }}
              />

              <PaperPicker
                papers={catalog?.papers ?? []}
                selected={paperId}
                onSelect={(next) => {
                  setPaperId(next);
                  markDirty();
                }}
              />

              <Controls
                settings={settings}
                onSettings={(next) => {
                  setSettings(next);
                  markDirty();
                }}
                inks={catalog?.inks ?? []}
                ranges={catalog?.ranges ?? {}}
                seed={seed}
                onSeed={(next) => {
                  setSeed(next);
                  markDirty();
                }}
              />

              <div className="generate-dock">
                <div className="generate-summary">
                  <span className="summary-label">这一页会用</span>
                  <strong>{font?.name ?? "手写字体"} · {paper?.name ?? "纸张"}</strong>
                  <span className="summary-sub">
                    {mode === "file" ? (file?.name ?? "未选择文件") : `${text.length.toLocaleString("zh-CN")} 字`}
                    {seed ? ` · 种子 ${seed}` : ""}
                  </span>
                </div>
                <button className="primary-button generate-button" onClick={handleGenerate} disabled={generating}>
                  {generating ? <><Loader2 size={17} className="spin" /> 正在生成</> : <><Sparkles size={17} /> 生成预览 <ArrowRight size={16} /></>}
                </button>
              </div>
            </section>

            <PreviewPanel
              job={job}
              font={font}
              paper={paper}
              page={page}
              onPage={setPage}
              generating={submitting || (Boolean(jobId) && !job)}
              stale={dirty}
              onGenerate={handleGenerate}
              onReroll={handleReroll}
              onDownload={() => setDownloadOpen(true)}
              onShowText={() => setTextOpen(true)}
            />
          </div>
        )}
      </main>

      <DownloadDialog
        open={downloadOpen}
        job={job}
        fontName={font?.name ?? job?.font_id ?? ""}
        paperName={paper?.name ?? job?.paper_id ?? ""}
        onClose={() => setDownloadOpen(false)}
        onToast={(message) => notify(message, "success")}
      />
      <TextDialog
        open={textOpen}
        text={job?.text ?? ""}
        warning={job?.warning ?? ""}
        onClose={() => setTextOpen(false)}
        onUse={handleUseText}
      />
      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />

      {toast && <Toast message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />}
    </div>
  );
}
