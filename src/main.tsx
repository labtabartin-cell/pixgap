import { Component, type ErrorInfo, type ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

type BoundaryState = { hasError: boolean; attempt: number };

class AppBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('HamGap screen recovery:', error, info);
  }

  recover = (): void => {
    this.setState((current) => ({ hasError: false, attempt: current.attempt + 1 }));
  };

  signOutAndRecover = (): void => {
    localStorage.removeItem('hamgo-token');
    this.recover();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-dvh place-items-center bg-[#071a2a] p-5 text-center text-white">
          <section className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-[#102a43] shadow-2xl">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-2xl font-black text-teal-700">!</div>
            <h1 className="mt-5 text-xl font-black">باز کردن این بخش انجام نشد</h1>
            <p className="mt-2 text-sm leading-7 text-slate-500">این خطا موقتی است و اطلاعات گفتگوهای شما حذف نشده‌اند. ابتدا بدون بستن صفحه دوباره تلاش کنید.</p>
            <button type="button" data-testid="recover-app-button" onClick={this.recover} className="mt-6 h-11 w-full rounded-xl bg-teal-600 text-sm font-bold text-white transition hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-200">تلاش دوباره</button>
            <button type="button" data-testid="recover-signout-button" onClick={this.signOutAndRecover} className="mt-3 h-11 w-full rounded-xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100">ورود دوباره به حساب</button>
          </section>
        </main>
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
