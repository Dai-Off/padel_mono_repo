import { TuActividadDataProvider } from '../contexts/TuActividadDataContext';
import { TuActividadScreen, type TuActividadDestination } from './TuActividadScreen';
import { MisPartidosActividadScreen } from './tuActividad/MisPartidosActividadScreen';
import { MisClasesActividadScreen } from './tuActividad/MisClasesActividadScreen';
import { MisCompeticionesActividadScreen } from './tuActividad/MisCompeticionesActividadScreen';
import type { PartidoItem } from './PartidosScreen';

type TuActividadFlowProps = {
  subView: TuActividadDestination | null;
  onCloseFlow: () => void;
  onBackToMenu: () => void;
  onNavigate: (destination: TuActividadDestination) => void;
  onPartidoPress: (partido: PartidoItem) => void;
};

function TuActividadFlowInner({
  subView,
  onCloseFlow,
  onBackToMenu,
  onNavigate,
  onPartidoPress,
}: TuActividadFlowProps) {
  if (subView === 'partidos') {
    return (
      <MisPartidosActividadScreen onBack={onBackToMenu} onPartidoPress={onPartidoPress} />
    );
  }
  if (subView === 'clases') {
    return <MisClasesActividadScreen onBack={onBackToMenu} />;
  }
  if (subView === 'competiciones') {
    return <MisCompeticionesActividadScreen onBack={onBackToMenu} />;
  }
  return <TuActividadScreen onBack={onCloseFlow} onNavigate={onNavigate} />;
}

export function TuActividadFlow(props: TuActividadFlowProps) {
  return (
    <TuActividadDataProvider>
      <TuActividadFlowInner {...props} />
    </TuActividadDataProvider>
  );
}
