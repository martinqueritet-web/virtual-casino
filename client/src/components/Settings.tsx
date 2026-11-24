import { api } from "../api";
import { useApp, type Prefs } from "../state";
import { Modal } from "./UI";
import { PlayingCard } from "./Cards";

const BACKS = [
  ["emerald", "Émeraude"],
  ["ruby", "Rubis"],
  ["midnight", "Minuit"],
  ["gold", "Or"],
];
const TABLES = [
  ["classic", "Feutre vert"],
  ["ruby", "Velours rubis"],
  ["midnight", "Bleu nuit"],
];

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, updateUser, toast, user } = useApp();
  const save = async (patch: Prefs) => {
    if (!user) return;
    updateUser({ ...user, prefs: { ...prefs, ...patch } });
    try {
      const r = await api("/me", { method: "PATCH", body: { prefs: patch } });
      updateUser(r.user);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const Toggle = ({ k, label, hint }: { k: keyof Prefs; label: string; hint: string }) => (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-gold-pale">{label}</span>
        <span className="block text-xs text-gold-pale/50">{hint}</span>
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[#d9b45a]" checked={!!prefs[k]} onChange={(e) => save({ [k]: e.target.checked })} />
    </label>
  );
  return (
    <Modal open={open} onClose={onClose} title="Paramètres">
      <div className="divide-y divide-gold/10">
        <Toggle k="sound" label="Effets sonores" hint="Cartes, jetons et signal quand c'est votre tour" />
        <Toggle k="showHelp" label="Aide pour débutants" hint="Explications sous les boutons et valeur de votre main" />
        <Toggle k="colorblind" label="Mode daltonien" hint="Jeu à 4 couleurs : carreaux bleus, trèfles verts" />
        <Toggle k="reducedFx" label="Réduire les animations" hint="Supprime les mouvements non essentiels" />
        <Toggle k="lowPower" label="Mode économie" hint="Graphismes allégés pour les petits appareils" />
      </div>
      <h3 className="mb-2 mt-5 text-sm text-gold-pale/70">Dos des cartes</h3>
      <div className="flex gap-3">
        {BACKS.map(([id, name]) => (
          <button key={id} onClick={() => save({ cardBack: id })} className={`flex flex-col items-center gap-1 rounded-lg p-1.5 ${prefs.cardBack === id ? "bg-gold/15 ring-1 ring-gold" : ""}`} aria-pressed={prefs.cardBack === id}>
            <BackPreview id={id} />
            <span className="text-xs">{name}</span>
          </button>
        ))}
      </div>
      <h3 className="mb-2 mt-5 text-sm text-gold-pale/70">Tapis de la table de poker</h3>
      <div className="flex flex-wrap gap-2">
        {TABLES.map(([id, name]) => (
          <button key={id} onClick={() => save({ tableTheme: id })} className={`rounded-lg border px-3 py-2 text-sm ${prefs.tableTheme === id ? "border-gold bg-gold/15" : "border-gold/20"}`} aria-pressed={prefs.tableTheme === id}>
            {name}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BackPreview({ id }: { id: string }) {
  return <PlayingCard card={null} size="sm" back={id} />;
}

export const TABLE_THEMES: Record<string, { felt: string; hi: string; lo: string; rail: string }> = {
  classic: { felt: "#0e5c46", hi: "#1c8064", lo: "#053425", rail: "#3a2412" },
  ruby: { felt: "#6e1626", hi: "#94263a", lo: "#360810", rail: "#2a1a10" },
  midnight: { felt: "#15295a", hi: "#22408a", lo: "#081430", rail: "#1c1c24" },
};
