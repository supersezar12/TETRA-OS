import {useState} from 'react';
import {Monitor, Smartphone} from 'lucide-react';
import {
  SCREEN_WIREFRAMES,
  type WireframeZone,
} from '../utils/platformBlueprints';

const ZONE_FRAME_STYLES: Record<WireframeZone['slotType'], string> = {
  header: 'border-slate-300 bg-slate-100/90',
  sidebar: 'border-slate-300 bg-slate-50 border-dashed',
  kpis: 'border-slate-300 bg-white',
  chart: 'border-slate-300 bg-slate-50',
  table: 'border-slate-300 bg-white',
  inspector: 'border-slate-300 bg-slate-50',
  actions: 'border-slate-400 bg-slate-100',
};

function WireframeSkeleton({slotType}: {slotType: WireframeZone['slotType']}) {
  if (slotType === 'kpis') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden="true">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2"
          >
            <div className="h-2 w-12 rounded bg-slate-300" />
            <div className="mt-2 h-3.5 w-16 rounded bg-slate-400" />
          </div>
        ))}
      </div>
    );
  }

  if (slotType === 'chart') {
    return (
      <div
        className="mt-3 flex h-24 items-end gap-2 rounded-md border border-dashed border-slate-300 bg-white p-3"
        aria-hidden="true"
      >
        {[40, 68, 52, 84, 60, 92].map((height, idx) => (
          <div
            key={idx}
            className="flex-1 rounded-t bg-slate-300"
            style={{height: `${height}%`}}
          />
        ))}
      </div>
    );
  }

  if (slotType === 'table') {
    return (
      <div className="mt-3 space-y-1.5" aria-hidden="true">
        {[1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5"
          >
            <div className="h-2 w-24 rounded bg-slate-300" />
            <div className="h-2 w-14 rounded bg-slate-200" />
            <div className="h-2 w-10 rounded bg-slate-300" />
          </div>
        ))}
      </div>
    );
  }

  if (slotType === 'actions') {
    return (
      <div className="mt-3 flex flex-wrap gap-2" aria-hidden="true">
        <div className="h-6 w-24 rounded bg-slate-800" />
        <div className="h-6 w-24 rounded border border-slate-300 bg-white" />
        <div className="h-6 w-28 rounded border border-slate-300 bg-white" />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5" aria-hidden="true">
      <div className="h-2.5 w-3/4 rounded bg-slate-300" />
      <div className="h-2.5 w-1/2 rounded bg-slate-200" />
    </div>
  );
}

export function WireframeExplorerView() {
  const [selectedScreenId, setSelectedScreenId] = useState<string>(
    SCREEN_WIREFRAMES[0].id,
  );
  const [previewFrame, setPreviewFrame] = useState<'desktop' | 'mobile'>('desktop');

  const activeScreen =
    SCREEN_WIREFRAMES.find((screen) => screen.id === selectedScreenId) ??
    SCREEN_WIREFRAMES[0];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-widest text-slate-500">
              Structural UI Blueprints
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              TETRA OS Screen Wireframes
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Interactive layout wireframes for core TETRA OS screens showing grid
              hierarchy, component zones, primary user actions, and enforced
              mathematical/RBAC guardrails across desktop and mobile viewports.
            </p>
          </div>

          <div
            role="group"
            aria-label="Wireframe viewport toggle"
            className="inline-flex self-start rounded-lg border border-slate-200 bg-slate-50 p-1"
          >
            <button
              type="button"
              aria-pressed={previewFrame === 'desktop'}
              onClick={() => setPreviewFrame('desktop')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                previewFrame === 'desktop'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              aria-pressed={previewFrame === 'mobile'}
              onClick={() => setPreviewFrame('mobile')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                previewFrame === 'mobile'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Mobile</span>
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Wireframe screen selector"
          className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5"
        >
          {SCREEN_WIREFRAMES.map((screen) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedScreenId(screen.id)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {screen.title}
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section
          aria-labelledby="wireframe-canvas-heading"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 lg:col-span-8"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2
                id="wireframe-canvas-heading"
                className="text-base font-semibold text-slate-900"
              >
                {activeScreen.title}
              </h2>
              <p className="font-mono text-xs text-slate-500">
                Route: {activeScreen.route} &middot; Frame:{' '}
                {previewFrame === 'desktop' ? '12-Col Desktop' : 'Single-Col Mobile'}
              </p>
            </div>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-700">
              WIREFRAME
            </span>
          </div>

          <div
            data-testid="wireframe-canvas"
            data-frame={previewFrame}
            className={`mx-auto rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 ${
              previewFrame === 'mobile' ? 'max-w-sm' : 'w-full'
            }`}
          >
            <div className="grid grid-cols-12 gap-3">
              {activeScreen.zones.map((zone) => (
                <div
                  key={zone.id}
                  className={`rounded-lg border p-3.5 ${ZONE_FRAME_STYLES[zone.slotType]} ${
                    previewFrame === 'mobile' ? 'col-span-12' : zone.colSpanDesktop
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800">
                      {zone.label}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-slate-500">
                      {zone.slotType}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{zone.description}</p>
                  <WireframeSkeleton slotType={zone.slotType} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside
          aria-labelledby="wireframe-spec-heading"
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6 lg:col-span-4"
        >
          <div>
            <span className="font-mono text-xs text-slate-500">
              {activeScreen.category}
            </span>
            <h2
              id="wireframe-spec-heading"
              className="mt-1 text-base font-semibold text-slate-900"
            >
              Screen Specification
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {activeScreen.purpose}
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Primary User Actions
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeScreen.primaryActions.map((action) => (
                <span
                  key={action}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {action}
                </span>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Mandatory Guardrails
            </h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-slate-600">
              {activeScreen.guardrails.map((rule) => (
                <li
                  key={rule}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                >
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
