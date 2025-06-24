interface MobileHeaderProps {
  schoolName: string;
  studentName: string;
}

export default function MobileHeader({ schoolName, studentName }: MobileHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-graduation-cap text-white text-sm"></i>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">EscuelaPay</h1>
              <p className="text-xs text-slate-500">{schoolName}</p>
            </div>
          </div>
          <button className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
            <i className="fas fa-bell text-sm"></i>
          </button>
        </div>
      </div>
    </header>
  );
}
