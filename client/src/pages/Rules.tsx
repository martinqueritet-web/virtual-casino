import { useState } from "react";
import { PlayingCard } from "../components/Cards";
import { TopBar } from "../components/UI";
import { evaluateBest } from "../../../server/games/evaluator";
import { newDeck, shuffle } from "../../../server/games/cards";

const RANKINGS: [string, string, string[]][] = [
  ["Quinte flush royale", "As, Roi, Dame, Valet, 10 de la même couleur. Imbattable.", ["Ah", "Kh", "Qh", "Jh", "Th"]],
  ["Quinte flush", "5 cartes qui se suivent, de la même couleur.", ["9s", "8s", "7s", "6s", "5s"]],
  ["Carré", "4 cartes de même valeur.", ["Qc", "Qd", "Qh", "Qs", "4d"]],
  ["Full", "Un brelan et une paire.", ["Kd", "Ks", "Kc", "7h", "7d"]],
  ["Couleur", "5 cartes de la même couleur, dans n'importe quel ordre.", ["Ad", "Jd", "8d", "5d", "2d"]],
  ["Quinte", "5 cartes qui se suivent, de couleurs mélangées.", ["Ts", "9h", "8d", "7c", "6s"]],
  ["Brelan", "3 cartes de même valeur.", ["7c", "7d", "7s", "Kh", "2c"]],
  ["Double paire", "Deux paires différentes.", ["Jh", "Jc", "4s", "4d", "Ah"]],
  ["Paire", "2 cartes de même valeur.", ["Kh", "Kd", "9c", "6s", "3d"]],
  ["Carte haute", "Aucune combinaison : la plus haute carte compte.", ["Ac", "Qd", "8h", "5s", "3c"]],
];

export function HandRankings() {
  return (
    <ol className="space-y-3">
      {RANKINGS.map(([name, desc, cards]) => (
        <li key={name} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex gap-1">
            {cards.map((c) => (
              <PlayingCard key={c} card={c} size="sm" />
            ))}
          </div>
          <div>
            <div className="font-semibold text-gold">{name}</div>
            <div className="text-sm text-gold-pale/70">{desc}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Tutoriel interactif : deviner quelle main gagne. */
function WhoWins() {
  const deal = () => {
    const d = shuffle(newDeck());
    return { a: [d[0], d[1]], b: [d[2], d[3]], board: d.slice(4, 9) };
  };
  const [g, setG] = useState(deal);
  const [answer, setAnswer] = useState<null | "a" | "b" | "tie">(null);
  const [score, setScore] = useState({ ok: 0, total: 0 });
  const ea = evaluateBest([...g.a, ...g.board]);
  const eb = evaluateBest([...g.b, ...g.board]);
  const truth = ea.score > eb.score ? "a" : eb.score > ea.score ? "b" : "tie";
  const pick = (x: "a" | "b" | "tie") => {
    if (answer) return;
    setAnswer(x);
    setScore((s) => ({ ok: s.ok + (x === truth ? 1 : 0), total: s.total + 1 }));
  };
  return (
    <div className="felt relative rounded-2xl border-4 border-[#3a2412] p-5" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
      <div className="relative z-10">
        <div className="flex items-center justify-between">
          <h3 className="font-marquee text-2xl text-gold-pale">Quelle main gagne ?</h3>
          <span className="text-sm text-gold-pale/80">
            {score.ok} / {score.total}
          </span>
        </div>
        <p className="mb-4 text-sm text-gold-pale/75">Chaque joueur combine ses 2 cartes avec les 5 cartes communes pour former la meilleure main de 5 cartes.</p>
        <div className="mb-4 flex justify-center gap-1">
          {g.board.map((c) => (
            <PlayingCard key={c} card={c} size="md" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(["a", "b"] as const).map((k) => (
            <button key={k} onClick={() => pick(k)} className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${answer && truth === k ? "border-gold bg-gold/15" : "border-gold/25 bg-black/30 hover:bg-black/45"}`}>
              <span className="text-sm text-gold-pale/80">Joueur {k === "a" ? "1" : "2"}</span>
              <div className="flex gap-1">
                {g[k].map((c) => (
                  <PlayingCard key={c} card={c} size="md" />
                ))}
              </div>
              {answer && <span className="text-sm text-gold">{(k === "a" ? ea : eb).label}</span>}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
          {!answer ? (
            <button className="btn-ghost text-sm" onClick={() => pick("tie")}>
              Égalité
            </button>
          ) : (
            <>
              <span className="text-gold-pale">
                {answer === truth ? "Bien vu !" : "Pas tout à fait."} {truth === "tie" ? "Les deux mains sont identiques : le pot est partagé." : `Le joueur ${truth === "a" ? 1 : 2} gagne.`}
              </span>
              <button
                className="btn-gold text-sm"
                onClick={() => {
                  setG(deal());
                  setAnswer(null);
                }}
              >
                Donne suivante
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RulesPage() {
  return (
    <div className="min-h-dvh">
      <TopBar title="Règles des jeux" />
      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le poker Texas Hold'em</h2>
          <div className="space-y-3 text-gold-pale/85">
            <p>Chaque joueur reçoit 2 cartes cachées. Cinq cartes communes sont ensuite posées au centre, en trois étapes : le flop (3 cartes), le turn (1 carte) et la river (1 carte).</p>
            <p>Avant chaque étape, les joueurs misent à tour de rôle. Le but : avoir la meilleure main de 5 cartes à l'abattage, ou faire abandonner tous les autres.</p>
            <p>Les deux joueurs à gauche du donneur (D) posent les blinds, des mises obligatoires qui lancent le pot.</p>
          </div>
          <h3 className="mb-2 mt-5 text-lg font-semibold text-gold-pale">Les actions</h3>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              ["Se coucher", "Abandonner la main. Vous perdez ce que vous avez déjà misé."],
              ["Parole", "Passer sans miser, possible seulement si personne n'a misé."],
              ["Suivre", "Égaler la mise la plus haute."],
              ["Relancer", "Augmenter la mise. Les autres doivent suivre, relancer ou se coucher."],
              ["Tapis", "Miser tous vos jetons. Si d'autres misent plus, un pot annexe est créé."],
            ].map(([t, d]) => (
              <div key={t} className="panel p-3">
                <dt className="font-semibold text-gold">{t}</dt>
                <dd className="text-gold-pale/75">{d}</dd>
              </div>
            ))}
          </dl>
        </section>
        <WhoWins />
        <section>
          <h2 className="mb-4 font-marquee text-3xl text-gold">Les combinaisons, de la plus forte à la plus faible</h2>
          <HandRankings />
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le blackjack</h2>
          <div className="space-y-2 text-gold-pale/85">
            <p>Approchez-vous le plus possible de 21 sans le dépasser, et battez le croupier. Les figures valent 10, l'As vaut 1 ou 11.</p>
            <p>Tirer : recevoir une carte. Rester : garder votre total. Doubler : doubler la mise et recevoir une seule carte. Séparer : jouer une paire en deux mains distinctes. Abandonner : renoncer avec vos 2 premières cartes et récupérer la moitié de la mise.</p>
            <p>Assurance : quand le croupier montre un As, vous pouvez miser la moitié de votre mise sur son blackjack. Elle paie 2 pour 1, mais à long terme elle coûte plus qu'elle ne rapporte.</p>
            <p>Règles de cette table : sabot de 6 jeux remélangé à la carte de coupe (environ aux trois quarts), le croupier reste sur 17, blackjack payé 3 pour 2, doubler autorisé après séparation, les As séparés ne reçoivent qu'une carte.</p>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">La roulette européenne</h2>
          <div className="space-y-2 text-gold-pale/85">
            <p>Le cylindre compte 37 cases : les numéros de 1 à 36, rouges ou noirs, et un zéro vert. Placez vos jetons sur le tapis, puis lancez la bille.</p>
            <p>Un numéro seul paie 35 pour 1. Une douzaine ou une colonne paie 2 pour 1. Rouge ou noir, pair ou impair, 1 à 18 ou 19 à 36 paient 1 pour 1. Si le zéro sort, ces chances simples perdent.</p>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le baccara</h2>
          <div className="space-y-2 text-gold-pale/85">
            <p>Deux mains s'affrontent : le Joueur et la Banque. Vous pariez sur celle qui s'approchera le plus de 9, ou sur l'égalité. Les figures et les 10 valent 0, l'As vaut 1, et seul le chiffre des unités compte.</p>
            <p>Les troisièmes cartes sont tirées automatiquement selon le règlement officiel. Gains : Joueur 1 pour 1, Banque 0,95 pour 1 (commission de 5 %), Égalité 8 pour 1, Paires 11 pour 1. En cas d'égalité, les mises Joueur et Banque sont rendues.</p>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le vidéo poker (Jacks or Better)</h2>
          <p className="text-gold-pale/85">Vous recevez 5 cartes. Gardez celles que vous voulez, puis tirez : les autres sont remplacées une seule fois. La main finale paie selon la table, à partir d'une paire de Valets. Quinte flush royale : 800 fois la mise. Un conseil vous indique quelles cartes garder.</p>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le keno</h2>
          <p className="text-gold-pale/85">Choisissez de 1 à 10 numéros entre 1 et 40. Le serveur en tire 10. Votre gain dépend du nombre de numéros choisis et du nombre de numéros trouvés ; la table des gains s'affiche pendant votre choix. Taux de retour : environ 95 %.</p>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">La roue de la fortune</h2>
          <p className="text-gold-pale/85">La roue compte 54 cases. Misez sur un ou plusieurs symboles : la case « 1 » paie 1 pour 1, « 2 » paie 2 pour 1, et ainsi de suite jusqu'au joker et au logo casino, payés 40 pour 1. Les grosses cotes sont rares.</p>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Les Mines</h2>
          <div className="space-y-2 text-gold-pale/85">
            <p>Choisissez votre mise et le nombre de mines (de 1 à 24) cachées parmi 25 cases. Chaque case sûre découverte révèle un diamant et augmente le multiplicateur.</p>
            <p>Vous pouvez encaisser à tout moment après une première case. Une mine fait perdre la mise. Le multiplicateur correspond aux vraies chances, avec un taux de retour de 97 %.</p>
            <p>Preuve d'équité : avant votre premier clic, le serveur publie l'empreinte de la grille. À la fin, la grille est dévoilée et votre navigateur vérifie qu'elle n'a pas été modifiée.</p>
          </div>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Le Plinko</h2>
          <p className="text-gold-pale/85">La bille tombe à travers 12 rangées de clous et rebondit à gauche ou à droite avec une chance sur deux. La case où elle termine multiplie votre mise. Les cases du centre sont les plus fréquentes et paient le moins ; celles des bords sont rares et paient le plus. Taux de retour théorique d'environ 99 %.</p>
        </section>
        <section>
          <h2 className="mb-3 font-marquee text-3xl text-gold">Les machines à sous</h2>
          <p className="text-gold-pale/85">
            Trois rouleaux, une ligne de gain au centre. Chaque résultat est tiré par le serveur avec un générateur aléatoire cryptographique : le navigateur ne peut pas l'influencer. La table des gains et le taux de retour théorique sont affichés sur chaque machine. Il n'y a aucun achat. Le mode automatique enchaîne au plus 100 tours, avec une limite de perte, un arrêt après un gros gain et un bouton « Arrêter » toujours visible ; il s'interrompt si vous quittez la page.
          </p>
        </section>
        <p className="text-sm text-gold-pale/50">VIRTUAL CASINO est un jeu de simulation. Les crédits virtuels sont fictifs, gratuits et sans valeur. Aucun dépôt, retrait ou achat n'existe.</p>
      </main>
    </div>
  );
}
