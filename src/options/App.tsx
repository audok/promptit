import { OptionsPageView } from './OptionsPageView';
import { useOptionsPageController } from './useOptionsPageController';

export default function App() {
  const controller = useOptionsPageController();

  return <OptionsPageView controller={controller} />;
}
