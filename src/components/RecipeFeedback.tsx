import { useKeyboard, KeyboardTextarea } from "../mobile";
import { useState } from "react";
import { InfoCircledIcon } from "@radix-ui/react-icons";
import { WebSheet } from "./WebSheet";
import { downloadTextFile } from "./browser-files";

export function RecipeFeedback({ id, title }: { id: string; title: string }) {
  const keyboard = useKeyboard();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Quantité");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  return <><button type="button" className="text-button" onClick={() => { keyboard.hide(); setOpen(true); }}><InfoCircledIcon /> Signaler un problème sur cette recette</button><WebSheet open={open} onOpenChange={setOpen} title="Préparer un signalement" description={title}><label className="text-field">Le problème concerne<select aria-label="Type de problème" value={reason} onChange={(event) => setReason(event.target.value)}>{["Quantité", "Étape", "Durée", "Photo", "Association", "Autre"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-field">Votre observation<KeyboardTextarea value={note} maxLength={2000} rows={4} onChange={(event) => setNote(event.target.value)} /></label><p className="inline-help">Téléchargez le signalement pour le transmettre à la personne qui gère Inflamm’Menu. Aucun envoi automatique.</p><button type="button" className="primary-button full-button" disabled={!note.trim()} onClick={() => { downloadTextFile(`signalement-${id}.txt`, `Inflamm’Menu — signalement\nRecette : ${title} (${id})\nMotif : ${reason}\n\n${note.trim()}\n`); setMessage("Signalement téléchargé. Il reste à le transmettre."); }}>Télécharger le signalement</button><p role="status">{message}</p></WebSheet></>;
}
