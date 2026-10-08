import AppProviders from './app/providers/AppProviders.jsx';
import ErrorBoundary from './components/feedback/ErrorBoundary.jsx';

function App() {
  return (
    <ErrorBoundary>
      <AppProviders />
    </ErrorBoundary>
  );
}

export default App;
