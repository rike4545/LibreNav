'use client';

import { useState } from 'react';
import { BatteryCharging, Coffee, Globe, KeyRound, RotateCcw, Server, X } from 'lucide-react';
import { DEFAULT_ENDPOINTS, Endpoints, MAP_STYLES, getEndpoints, getLocalDataKey, resetEndpoints, saveEndpoints, saveLocalDataKey } from '@/lib/config';
import { CONNECTOR_OPTIONS } from '@/lib/services/overpass';
import { Preferences, ThemeChoice } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { VehicleProfile } from '@/types/map';

type Props = {
  preferences: Preferences;
  vehicle: VehicleProfile;
  /** Networks seen in the currently loaded chargers. */
  chargerNetworks: string[];
  onPreferencesChange: (preferences: Preferences) => void;
  onVehicleChange: (vehicle: VehicleProfile) => void;
  onClose: () => void;
};

export function SettingsPanel({ preferences, vehicle, chargerNetworks, onPreferencesChange, onVehicleChange, onClose }: Props) {
  const [endpoints, setEndpoints] = useState<Endpoints>(() => getEndpoints());
  const [saved, setSaved] = useState(false);
  const [localDataKey, setLocalDataKey] = useState(() => getLocalDataKey());
  const [keySaved, setKeySaved] = useState(false);

  function applyLocalDataKey() {
    saveLocalDataKey(localDataKey);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2200);
  }

  function applyEndpoints() {
    saveEndpoints(endpoints);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  function restoreDefaults() {
    setEndpoints(resetEndpoints());
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return (
    <div className="flex max-h-[min(85vh,44rem)] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-panel">
      <header className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-lg font-semibold text-fg">Settings</h2>
        <button type="button" onClick={onClose} aria-label="Close settings" className="rounded-full p-1.5 text-subtle hover:bg-strong hover:text-fg">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="overflow-y-auto px-5 py-4">
        <Section title="Display" icon={<Globe className="h-4 w-4" />}>
          <div className="mb-3">
            <div className="text-xs font-medium text-muted">Theme</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['system', 'light', 'dark'] as ThemeChoice[]).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => onPreferencesChange({ ...preferences, theme: choice })}
                  aria-pressed={preferences.theme === choice}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition',
                    preferences.theme === choice
                      ? 'border-sky-400 bg-sky-500/25 text-sky-100'
                      : 'border-line bg-raised text-muted hover:bg-strong'
                  )}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label="Imperial units"
            hint="Miles and feet instead of kilometres and metres."
            checked={preferences.imperial}
            onChange={(value) => onPreferencesChange({ ...preferences, imperial: value })}
          />
          <Toggle
            label="Voice guidance"
            hint="Speak turn instructions during navigation."
            checked={preferences.voiceGuidance}
            onChange={(value) => onPreferencesChange({ ...preferences, voiceGuidance: value })}
          />
          <Toggle
            label="Show chargers"
            checked={preferences.showChargers}
            onChange={(value) => onPreferencesChange({ ...preferences, showChargers: value })}
          />
          <Toggle
            label="Road alerts"
            hint="Warn on approach to speed cameras and your reported hazards."
            checked={preferences.alertsEnabled}
            onChange={(value) => onPreferencesChange({ ...preferences, alertsEnabled: value })}
          />
          <Toggle
            label="3D terrain"
            hint="Elevation shading from open AWS terrain tiles."
            checked={preferences.terrain3d}
            onChange={(value) => onPreferencesChange({ ...preferences, terrain3d: value })}
          />
          <div className="mt-3">
            <div className="text-xs font-medium text-muted">Map style</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MAP_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onPreferencesChange({ ...preferences, mapStyleId: style.id })}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    preferences.mapStyleId === style.id
                      ? 'border-sky-400 bg-sky-500/25 text-sky-100'
                      : 'border-line bg-raised text-muted hover:bg-strong'
                  )}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            label="Hide chargers under"
            suffix="kW"
            value={preferences.minChargerKw}
            min={0}
            max={350}
            step={25}
            onChange={(value) => onPreferencesChange({ ...preferences, minChargerKw: value })}
          />

          <SelectField
            label="Connector"
            value={preferences.chargerConnector}
            options={CONNECTOR_OPTIONS}
            allLabel="Any connector"
            onChange={(value) => onPreferencesChange({ ...preferences, chargerConnector: value })}
          />

          <SelectField
            label="Network"
            value={preferences.chargerNetwork}
            options={chargerNetworks}
            allLabel={chargerNetworks.length ? 'Any network' : 'No networks loaded yet'}
            onChange={(value) => onPreferencesChange({ ...preferences, chargerNetwork: value })}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">
            Connector and network come from OpenStreetMap tags, which are often missing — filtering will hide chargers
            that simply have not been tagged.
          </p>
        </Section>

        <Section title="Vehicle" icon={<BatteryCharging className="h-4 w-4" />}>
          <p className="mb-2 text-xs leading-relaxed text-subtle">
            Used for the range estimate on the route sheet. It is a flat energy model — no elevation, temperature, or speed
            effects — so treat it as a planning hint.
          </p>
          <NumberField label="Usable battery" suffix="kWh" value={vehicle.batteryKwh} min={0} max={250} step={1} onChange={(v) => onVehicleChange({ ...vehicle, batteryKwh: v })} />
          <NumberField label="Consumption" suffix="kWh/100km" value={vehicle.consumptionKwh100km} min={5} max={45} step={0.5} onChange={(v) => onVehicleChange({ ...vehicle, consumptionKwh100km: v })} />
          <NumberField label="Current charge" suffix="%" value={vehicle.socPercent} min={0} max={100} step={1} onChange={(v) => onVehicleChange({ ...vehicle, socPercent: v })} />
          <NumberField label="Arrival reserve" suffix="%" value={vehicle.reservePercent} min={0} max={50} step={1} onChange={(v) => onVehicleChange({ ...vehicle, reservePercent: v })} />
        </Section>

        <Section title="Service endpoints" icon={<Server className="h-4 w-4" />}>
          <p className="mb-3 text-xs leading-relaxed text-subtle">
            LibreNav ships pointed at the public OSM services. Point these at your own stack — the bundled{' '}
            <code className="rounded bg-raised px-1 py-0.5 text-[11px]">docker-compose.yml</code> runs Valhalla and Photon
            locally. Browsers block http://localhost from an https page, so use the local dev server for a self-hosted setup.
          </p>

          <TextField label="Valhalla (routing)" value={endpoints.valhallaUrl} placeholder={DEFAULT_ENDPOINTS.valhallaUrl} onChange={(v) => setEndpoints({ ...endpoints, valhallaUrl: v })} />
          <TextField label="Photon (search)" value={endpoints.photonUrl} placeholder={DEFAULT_ENDPOINTS.photonUrl} onChange={(v) => setEndpoints({ ...endpoints, photonUrl: v })} />
          <TextField label="Overpass (map data)" value={endpoints.overpassUrl} placeholder={DEFAULT_ENDPOINTS.overpassUrl} onChange={(v) => setEndpoints({ ...endpoints, overpassUrl: v })} />
          <TextField
            label="Basemap style URL (overrides the picker)"
            value={endpoints.mapStyleUrl}
            placeholder={DEFAULT_ENDPOINTS.mapStyleUrl}
            onChange={(v) => setEndpoints({ ...endpoints, mapStyleUrl: v })}
          />

          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={applyEndpoints} className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
              Save endpoints
            </button>
            <button
              type="button"
              onClick={restoreDefaults}
              className="flex items-center gap-1.5 rounded-full border border-line bg-raised px-4 py-2 text-sm font-medium text-muted transition hover:bg-strong"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Defaults
            </button>
            {saved ? <span className="text-xs font-medium text-emerald-300">Saved</span> : null}
          </div>
        </Section>

        <Section title="Place data key (optional)" icon={<KeyRound className="h-4 w-4" />}>
          <p className="mb-3 text-xs leading-relaxed text-subtle">
            LibreNav works fully without this. Adding an{' '}
            <a
              href="https://www.openwebninja.com/documentation"
              target="_blank"
              rel="noreferrer noopener"
              className="text-sky-300 underline-offset-2 hover:underline"
            >
              OpenWeb Ninja
            </a>{' '}
            key mixes business results — ratings, opening status, addresses — into search alongside
            OpenStreetMap, which tends to be thin on shops and restaurants.
          </p>
          <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-100">
            Your key is stored only in this browser and is never sent anywhere except that API. It is
            deliberately not built into the app: LibreNav is a static site, so a key compiled in would
            be readable by every visitor and by anyone reading the repository.
          </p>

          <label className="block">
            <span className="block text-xs font-medium text-muted">API key</span>
            <input
              type="password"
              value={localDataKey}
              placeholder="Paste your key"
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setLocalDataKey(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-sky-400"
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={applyLocalDataKey}
              className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
            >
              Save key
            </button>
            <button
              type="button"
              onClick={() => {
                setLocalDataKey('');
                saveLocalDataKey('');
                setKeySaved(true);
                setTimeout(() => setKeySaved(false), 2200);
              }}
              className="rounded-full border border-line bg-raised px-4 py-2 text-sm font-medium text-muted transition hover:bg-strong"
            >
              Remove
            </button>
            {keySaved ? <span className="text-xs font-medium text-emerald-300">Saved</span> : null}
          </div>
        </Section>

        <a
          href="https://buymeacoffee.com/myevcompanionapp"
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 flex items-center justify-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
        >
          <Coffee className="h-4 w-4" />
          Support this project
        </a>

        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-subtle">
          Map data © OpenStreetMap contributors. Routing by Valhalla (FOSSGIS), search by Photon (Komoot), places via
          Overpass, speed limits and cameras from OSM via Valhalla and Overpass. Everything you save stays in this browser.
        </p>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg">
        <span className="text-sky-400">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {hint ? <span className="block text-xs text-subtle">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition', checked ? 'bg-sky-500' : 'bg-strong')}
      >
        <span className={cn('block h-5 w-5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </button>
    </label>
  );
}

function NumberField({
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm text-fg">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
          }}
          className="w-24 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-right text-sm tabular-nums text-fg outline-none focus:border-sky-400"
        />
        <span className="w-20 text-xs text-subtle">{suffix}</span>
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  allLabel,
  onChange
}: {
  label: string;
  value: string | null;
  options: string[];
  allLabel: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="mt-3 flex items-center justify-between gap-3">
      <span className="text-sm text-fg">{label}</span>
      <select
        value={value ?? ''}
        disabled={!options.length}
        onChange={(event) => onChange(event.target.value || null)}
        className="w-48 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-sm text-fg outline-none focus:border-sky-400 disabled:opacity-50"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="mt-3 block">
      <span className="block text-xs font-medium text-muted">{label}</span>
      <input
        type="url"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-fg outline-none focus:border-sky-400"
      />
    </label>
  );
}
