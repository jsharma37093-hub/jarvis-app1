import React, { useState } from 'react';
import { Check, Copy, Download, FileCode2, FolderTree } from 'lucide-react';
import { ANDROID_KOTLIN_FILES, ANDROID_PROJECT_TREE } from '../data/androidKotlinProject';

export const AndroidProjectStudio: React.FC = () => {
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [showTree, setShowTree] = useState<boolean>(false);

  const activeFile = ANDROID_KOTLIN_FILES[selectedFileIndex] || ANDROID_KOTLIN_FILES[0];

  const handleCopyFile = (code: string, path: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleDownloadFullBundle = () => {
    const bundleContent = [
      '# JARVIS — Complete Buildable Android Project Bundle',
      '# Created by Krishna Sharma Sir ("Mujhe Krishna Sharma Sir ne banaya hai.")',
      '',
      '## Project Structure',
      '```',
      ANDROID_PROJECT_TREE,
      '```',
      '',
      ...ANDROID_KOTLIN_FILES.map(
        (file) =>
          `================================================================================\nFILE: ${file.path}\nMODULE: ${file.module}\nDESCRIPTION: ${file.description}\n================================================================================\n\n${file.code}\n`
      ),
    ].join('\n');

    const blob = new Blob([bundleContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jarvis-android-kotlin-project-bundle.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border border-slate-800 rounded-2xl bg-[#0D1322] p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            01. Buildable Android Kotlin &amp; Jetpack Compose Source Architecture
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Production-ready Kotlin modules using Jetpack Compose, Coroutines, StateFlow, AccessibilityService, MediaProjection, CameraX, and EncryptedSharedPreferences.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowTree((prev) => !prev)}
            className="px-3.5 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{showTree ? 'Hide Directory Tree' : 'View Directory Tree'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadFullBundle}
            className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Full Android Project</span>
          </button>
        </div>
      </div>

      {showTree && (
        <div className="mt-4 p-4 rounded-xl bg-[#090D16] border border-slate-800 overflow-x-auto">
          <pre className="text-xs font-mono text-slate-300 leading-relaxed">
            {ANDROID_PROJECT_TREE}
          </pre>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left File Explorer */}
        <div className="lg:col-span-4 flex flex-col gap-1.5 max-h-[620px] overflow-y-auto pr-1">
          {ANDROID_KOTLIN_FILES.map((file, idx) => {
            const isSelected = idx === selectedFileIndex;
            const fileName = file.path.split('/').pop() || file.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedFileIndex(idx)}
                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-slate-900 border-sky-500/60 text-slate-100'
                    : 'bg-[#090D16]/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold font-mono truncate text-slate-100">
                    {fileName}
                  </span>
                  <span className="text-[11px] text-slate-500 shrink-0">{file.module}</span>
                </div>
                <p className="mt-1 text-[11px] font-mono text-slate-500 truncate">{file.path}</p>
              </button>
            );
          })}
        </div>

        {/* Right Code Viewer */}
        <div className="lg:col-span-8 flex flex-col border border-slate-800 rounded-xl bg-[#090D16] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900/50">
            <div>
              <div className="flex items-center gap-2">
                <FileCode2 className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-mono font-semibold text-slate-100">
                  {activeFile.path}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{activeFile.description}</p>
            </div>

            <button
              type="button"
              onClick={() => handleCopyFile(activeFile.code, activeFile.path)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5"
            >
              {copiedPath === activeFile.path ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Source</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 overflow-x-auto max-h-[540px] overflow-y-auto">
            <pre className="text-xs font-mono text-slate-200 leading-relaxed">
              <code>{activeFile.code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
