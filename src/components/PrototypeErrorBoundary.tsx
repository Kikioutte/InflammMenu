import { Component, type ReactNode, type ErrorInfo } from "react";
import { loadRecoveryAppState, StoredStateReadError, exportRawRecovery, exportAppState, resetAppState } from "../storage";
import { Cross2Icon, DownloadIcon } from "@radix-ui/react-icons";
import { downloadTextFile } from "./browser-files";
import { isoDate } from "./format";
import { ConfirmActionDialog } from "./ConfirmActionDialog";

export class PrototypeErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; recoveryError: string }> {
  state: { error: Error | null; recoveryError: string } = { error: null, recoveryError: "" };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Inflamm’Menu render error", error, info.componentStack);
  }

  private downloadRecovery = async () => {
    try {
      const recovery = await loadRecoveryAppState().catch((error: unknown) => {
        if (error instanceof StoredStateReadError) return null;
        throw error;
      });
      if (!recovery) {
        downloadTextFile(
          `inflamm-menu-recuperation-brute-${isoDate(new Date())}.json`,
          await exportRawRecovery(),
          "application/json;charset=utf-8",
        );
        this.setState({ recoveryError: "Copie brute téléchargée avec les données accessibles. Conservez ce fichier pour une récupération technique : il ne s’importe pas comme une sauvegarde normale." });
        return;
      }
      downloadTextFile(
        `inflamm-menu-recuperation-${isoDate(new Date())}.json`,
        exportAppState(recovery.state),
        "application/json;charset=utf-8",
      );
      this.setState({
        recoveryError: recovery.complete
          ? ""
          : `Copie téléchargée depuis le stockage lisible, mais ${recovery.unreadableReplicas.join(" et ")} reste inaccessible. Ne réinitialisez pas avant d’avoir conservé cette copie.`,
      });
    } catch {
      this.setState({ recoveryError: "Impossible de préparer la copie de récupération. Vos données n’ont pas été supprimées." });
    }
  };

  private reset = async () => {
    try {
      await resetAppState();
      window.location.reload();
    } catch {
      throw new Error("La réinitialisation n’a pas abouti. Vos données locales sont conservées ; fermez les autres onglets Inflamm’Menu puis réessayez.");
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return <main className="fatal-error" role="alert">
      <Cross2Icon />
      <h1>Inflamm’Menu a rencontré une erreur</h1>
      <p>{this.state.error instanceof StoredStateReadError
        ? "Une copie locale est illisible ou provient d’une version plus récente. Son remplacement automatique a été bloqué. Téléchargez une copie de récupération avant toute réinitialisation."
        : "Vos données locales n’ont pas été volontairement supprimées. Téléchargez une copie de récupération avant de réinitialiser."}</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>Recharger l’application</button>
      <button type="button" className="secondary-button" data-testid="fatal-recovery" onClick={() => void this.downloadRecovery()}>Télécharger une copie de récupération</button>
      {this.state.recoveryError ? <p className="fatal-error__feedback" role="alert" data-testid="fatal-recovery-error">{this.state.recoveryError}</p> : null}
      <ConfirmActionDialog
        title="Réinitialiser toutes les données ?"
        description="Les semaines, favoris, recettes personnelles, notes et réglages de cet appareil seront supprimés. Téléchargez une copie et fermez les autres onglets Inflamm’Menu avant de continuer."
        confirmLabel="Tout réinitialiser"
        testId="fatal-reset-dialog"
        onConfirm={this.reset}
        trigger={<button type="button" className="secondary-button" data-testid="fatal-reset">Réinitialiser les données locales</button>}
      >
        <button type="button" className="secondary-button" data-testid="fatal-recovery-dialog" onClick={() => void this.downloadRecovery()}><DownloadIcon /> Télécharger une copie d’abord</button>
        {this.state.recoveryError ? <p className="fatal-error__feedback" role="alert">{this.state.recoveryError}</p> : null}
      </ConfirmActionDialog>
    </main>;
  }
}
