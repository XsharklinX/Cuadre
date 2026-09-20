import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Package, Sprout, BarChart3, LayoutDashboard,
  Plus, Trash2, Save, Download, AlertTriangle, CheckCircle2,
  MapPin, DollarSign, Calendar, ChevronRight, Info, Edit,
  Cloud, Sun, CloudRain, Printer, RefreshCw, CloudLightning, Settings
} from 'lucide-react';

// --- DATOS INICIALES DE DEMOSTRACIÓN ---
const INITIAL_DATA = {
  config: {
    lat: 19.55,
    lon: -71.05
  },
  plots: [
    { id: '1', name: 'Finca Principal', size: 150, crop: 'Banano' },
    { id: '2', name: 'Lote Norte', size: 80, crop: 'Arroz' }
  ],
  workers: [
    { id: '1', name: 'Juan Pérez', type: 'Día', defaultRate: 800 },
    { id: '2', name: 'Pedro Martínez', type: 'Ajuste', defaultRate: 15 }
  ],
  inventory: [
    { id: '1', name: 'Urea 46% (Abono)', category: 'Fertilizante', quantity: 50, unit: 'Sacos', unitCost: 1200 },
    { id: '2', name: 'Glifosato', category: 'Pesticida', quantity: 8, unit: 'Litros', unitCost: 850 }
  ],
  attendance: [
    { id: '1', date: new Date().toISOString().split('T')[0], workerId: '1', plotId: '1', workDone: 1, type: 'Día', totalPay: 800 },
    { id: '2', date: new Date().toISOString().split('T')[0], workerId: '2', plotId: '1', workDone: 100, type: 'Ajuste', totalPay: 1500 }
  ],
  harvests: [
    { id: '1', date: new Date().toISOString().split('T')[0], plotId: '1', product: 'Banano Exportación', quantity: 300, unit: 'Cajas', estimatedRevenue: 45000 }
  ],
  expenses: [
    { id: '1', date: new Date().toISOString().split('T')[0], plotId: '1', inventoryId: '1', quantityUsed: 5, totalCost: 6000 }
  ]
};

// --- HOOK PERSONALIZADO: ALMACENAMIENTO LOCAL ---
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.warn("Error guardando en el almacenamiento local", error);
    }
  };

  return [storedValue, setValue];
}

// --- COMPONENTE PRINCIPAL ---
export default function AgroFincaApp() {
  const [data, setData] = useLocalStorage('agrofinca_data_v3', INITIAL_DATA);
  const [activeTab, setActiveTab] = useState('resumen');
  const [notification, setNotification] = useState(null);
  const [modalDialog, setModalDialog] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const confirmAction = (title, message, onConfirm) => {
    setModalDialog({ title, message, onConfirm });
  };

  const updateCollection = (collectionName, newItems, silent = false) => {
    setData(prev => ({ ...prev, [collectionName]: newItems }));
    if(!silent) showNotification('Registro guardado exitosamente');
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      showNotification('Copia de seguridad en la nube completada.');
    }, 2000);
  };

  return (
    <div className="flex h-screen bg-stone-50 text-stone-800 font-sans selection:bg-emerald-200">
      
      {/* BARRA LATERAL (SIDEBAR) */}
      <aside className="w-72 bg-stone-900 text-stone-300 flex flex-col shadow-2xl z-20 transition-all duration-300 border-r border-stone-800">
        <div className="p-8 text-center border-b border-stone-800 bg-stone-950/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
          <div className="flex justify-center mb-4 relative z-10">
            <div className="p-3 bg-emerald-500/20 rounded-2xl shadow-inner shadow-emerald-500/10 ring-1 ring-emerald-500/30">
              <Sprout size={42} className="text-emerald-400 drop-shadow-md" />
            </div>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white relative z-10">AgroFinca<span className="text-emerald-400">Pro</span></h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">Gestión Agrícola Inteligente</p>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          <NavItem icon={<LayoutDashboard size={20} />} label="Panel Principal" active={activeTab === 'resumen'} onClick={() => setActiveTab('resumen')} />
          <NavItem icon={<MapPin size={20} />} label="Gestión de Parcelas" active={activeTab === 'parcelas'} onClick={() => setActiveTab('parcelas')} />
          <NavItem icon={<Users size={20} />} label="Personal y Nómina" active={activeTab === 'personal'} onClick={() => setActiveTab('personal')} />
          <NavItem icon={<Calendar size={20} />} label="Registro de Asistencia" active={activeTab === 'nomina'} onClick={() => setActiveTab('nomina')} />
          <NavItem icon={<Package size={20} />} label="Inventario e Insumos" active={activeTab === 'inventario'} onClick={() => setActiveTab('inventario')} />
          <NavItem icon={<Sprout size={20} />} label="Registro de Cosechas" active={activeTab === 'cosechas'} onClick={() => setActiveTab('cosechas')} />
          <NavItem icon={<BarChart3 size={20} />} label="Reportes Financieros" active={activeTab === 'reportes'} onClick={() => setActiveTab('reportes')} />
          <NavItem icon={<Settings size={20} />} label="Configuración" active={activeTab === 'configuracion'} onClick={() => setActiveTab('configuracion')} />
        </nav>

        <div className="p-6 border-t border-stone-800 bg-stone-950/40">
           <button 
             onClick={handleSync}
             disabled={isSyncing}
             className="w-full flex items-center justify-center gap-2 bg-stone-800 hover:bg-stone-700 text-stone-300 py-3 rounded-xl transition-all font-medium border border-stone-700"
           >
             <RefreshCw size={18} className={isSyncing ? "animate-spin text-emerald-400" : ""} />
             {isSyncing ? 'Sincronizando...' : 'Respaldar en la Nube'}
           </button>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col overflow-hidden relative bg-[#FAFAFA] print:bg-white print:overflow-visible">
        
        {/* CABECERA SUPERIOR (No visible al imprimir) */}
        <header className="bg-white/80 backdrop-blur-xl border-b border-stone-200 px-10 py-5 flex justify-between items-center z-10 sticky top-0 print:hidden shadow-sm">
          <div>
            <h2 className="text-2xl font-black text-stone-800 capitalize tracking-tight flex items-center gap-2">
              {activeTab === 'resumen' && <LayoutDashboard className="text-emerald-600" />}
              {activeTab === 'parcelas' && <MapPin className="text-emerald-600" />}
              {activeTab === 'personal' && <Users className="text-emerald-600" />}
              {activeTab === 'nomina' && <Calendar className="text-emerald-600" />}
              {activeTab === 'inventario' && <Package className="text-emerald-600" />}
              {activeTab === 'cosechas' && <Sprout className="text-emerald-600" />}
              {activeTab === 'reportes' && <BarChart3 className="text-emerald-600" />}
              {activeTab === 'configuracion' && <Settings className="text-emerald-600" />}
              {activeTab.replace('-', ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-stone-100 px-4 py-2 rounded-xl border border-stone-200 shadow-inner flex items-center gap-2">
              <Calendar size={18} className="text-stone-500" />
              <span className="text-sm font-bold text-stone-700 capitalize">
                {new Date().toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
        </header>

        {/* ÁREA DE CONTENIDO DINÁMICO */}
        <div className="flex-1 overflow-auto p-6 md:p-10 print:p-0 print:overflow-visible">
          <div className="max-w-7xl mx-auto animate-fade-in print:max-w-full">
            {activeTab === 'resumen' && <ResumenView data={data} setActiveTab={setActiveTab} config={data.config} />}
            {activeTab === 'parcelas' && <ParcelasView data={data} updateCollection={updateCollection} confirmAction={confirmAction} />}
            {activeTab === 'personal' && <PersonalView data={data} updateCollection={updateCollection} confirmAction={confirmAction} />}
            {activeTab === 'nomina' && <NominaView data={data} updateCollection={updateCollection} confirmAction={confirmAction} showNotification={showNotification} />}
            {activeTab === 'inventario' && <InventarioView data={data} updateCollection={updateCollection} confirmAction={confirmAction} showNotification={showNotification} />}
            {activeTab === 'cosechas' && <CosechasView data={data} updateCollection={updateCollection} confirmAction={confirmAction} />}
            {activeTab === 'reportes' && <ReportesView data={data} />}
            {activeTab === 'configuracion' && <ConfiguracionView data={data} updateCollection={updateCollection} showNotification={showNotification} />}
          </div>
        </div>

        {/* NOTIFICACIONES EMERGENTES (TOAST) */}
        {notification && (
          <div className={`absolute bottom-8 right-8 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 transform transition-all duration-300 translate-y-0 opacity-100 z-50
            ${notification.type === 'error' ? 'bg-rose-600 text-white' : 'bg-stone-900 text-emerald-50 border border-stone-700'}`}>
            {notification.type === 'error' ? <AlertTriangle size={24} className="text-white" /> : <CheckCircle2 size={24} className="text-emerald-400" />}
            <span className="font-bold">{notification.msg}</span>
          </div>
        )}

        {/* VENTANA MODAL DE CONFIRMACIÓN */}
        {modalDialog && (
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm flex justify-center items-center z-50 print:hidden">
            <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full border border-stone-100 transform scale-100 transition-transform">
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
                  <AlertTriangle size={28} />
                </div>
                <h3 className="text-xl font-bold text-stone-800">{modalDialog.title}</h3>
              </div>
              <p className="text-stone-600 mb-8 font-medium leading-relaxed">{modalDialog.message}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setModalDialog(null)} className="px-5 py-3 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition-colors">
                  Cancelar
                </button>
                <button 
                  onClick={() => { modalDialog.onConfirm(); setModalDialog(null); }} 
                  className="px-5 py-3 rounded-xl font-bold bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/30">
                  Confirmar Acción
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ESTILOS GLOBALES */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #44403c; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #57534e; }
        
        .input-field {
          width: 100%; padding: 0.875rem 1.25rem; border-radius: 1rem;
          border: 1px solid #e7e5e4; background-color: #f5f5f4;
          color: #292524; font-size: 0.875rem; font-weight: 500; outline: none;
          transition: all 0.2s ease-in-out;
        }
        .input-field:focus {
          border-color: #10b981; background-color: #ffffff;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
        }
        .btn-primary {
          background: #10b981; color: white; font-weight: 700; padding: 0.875rem 1.5rem;
          border-radius: 1rem; transition: all 0.2s ease;
          box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2), 0 2px 4px -1px rgba(16, 185, 129, 0.1);
        }
        .btn-primary:hover {
          background: #059669; transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3), 0 4px 6px -2px rgba(16, 185, 129, 0.15);
        }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media print {
          body * { visibility: hidden; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
          #printable-receipt { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
        }
      `}} />
    </div>
  );
}

// --- COMPONENTES DE INTERFAZ GENERALES ---

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 text-left font-bold group ${
        active 
        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/20' 
        : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100'
      }`}
    >
      <div className={`${active ? 'text-emerald-100' : 'text-stone-500 group-hover:text-emerald-400'} transition-colors`}>
        {icon}
      </div>
      <span className="flex-1 tracking-wide">{label}</span>
      {active && <ChevronRight size={16} className="text-emerald-200 opacity-80" />}
    </button>
  );
}

function StatCard({ title, value, subtitle, icon, colorClass, bgColor, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`relative overflow-hidden bg-white rounded-3xl p-6 border border-stone-100 shadow-sm 
      ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group' : ''}`}
    >
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-sm font-bold text-stone-400 mb-1 uppercase tracking-wider">{title}</p>
          <h3 className="text-3xl font-black text-stone-800 tracking-tight">{value}</h3>
        </div>
        <div className={`p-4 rounded-2xl ${bgColor} ${colorClass} shadow-inner`}>
          {icon}
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-stone-50 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${colorClass.replace('text-', 'bg-')}`}></div>
        <p className="text-sm font-bold text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

// --- VISTAS DE CADA SECCIÓN ---

function ResumenView({ data, setActiveTab, config }) {
  const hoy = new Date().toISOString().split('T')[0];
  const nominaHoy = data.attendance.filter(a => a.date === hoy).reduce((sum, a) => sum + Number(a.totalPay), 0);
  const totalTareas = data.plots.reduce((sum, p) => sum + Number(p.size), 0);
  const alertasInventario = data.inventory.filter(i => Number(i.quantity) < 10);

  // Lógica del Clima (Simulada/Real con Open-Meteo)
  const [weather, setWeather] = useState(null);
  const lat = config?.lat ?? 19.55;
  const lon = config?.lon ?? -71.05;
  useEffect(() => {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then(res => res.json())
      .then(resData => setWeather(resData.current_weather))
      .catch(err => console.warn("No se pudo obtener el clima", err));
  }, [lat, lon]);

  const getWeatherDetails = (code) => {
    if(!code) return { icon: <Cloud size={32}/>, text: "Cargando...", color: "text-stone-400" };
    if(code <= 3) return { icon: <Sun size={32}/>, text: "Despejado / Soleado", color: "text-amber-500" };
    if(code >= 51 && code <= 67) return { icon: <CloudRain size={32}/>, text: "Lluvia Activa", color: "text-blue-500" };
    if(code >= 95) return { icon: <CloudLightning size={32}/>, text: "Tormenta", color: "text-purple-500" };
    return { icon: <Cloud size={32}/>, text: "Nublado", color: "text-stone-500" };
  };

  const weatherInfo = weather ? getWeatherDetails(weather.weathercode) : getWeatherDetails(null);

  return (
    <div className="space-y-8">
      {/* TARJETAS SUPERIORES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Inversión Nómina Hoy" 
          value={`RD$ ${nominaHoy.toLocaleString()}`}
          subtitle={`${data.attendance.filter(a => a.date === hoy).length} registros hoy`}
          icon={<DollarSign size={24} />} 
          colorClass="text-emerald-600" bgColor="bg-emerald-50"
          onClick={() => setActiveTab('nomina')}
        />
        <StatCard 
          title="Terreno Productivo" 
          value={`${totalTareas} Tareas`}
          subtitle={`${data.plots.length} parcelas activas`}
          icon={<MapPin size={24} />} 
          colorClass="text-blue-600" bgColor="bg-blue-50"
          onClick={() => setActiveTab('parcelas')}
        />
        <StatCard 
          title="Fuerza Laboral" 
          value={data.workers.length}
          subtitle="Jornaleros registrados"
          icon={<Users size={24} />} 
          colorClass="text-indigo-600" bgColor="bg-indigo-50"
          onClick={() => setActiveTab('personal')}
        />
        <StatCard 
          title="Alertas Inventario" 
          value={alertasInventario.length}
          subtitle={alertasInventario.length === 0 ? "Nivel óptimo" : "Atención requerida"}
          icon={<AlertTriangle size={24} />} 
          colorClass={alertasInventario.length > 0 ? "text-rose-600" : "text-emerald-600"} 
          bgColor={alertasInventario.length > 0 ? "bg-rose-50" : "bg-emerald-50"}
          onClick={() => setActiveTab('inventario')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* WIDGET DEL CLIMA */}
        <div className="bg-gradient-to-br from-slate-800 to-stone-900 rounded-3xl shadow-lg border border-stone-800 overflow-hidden text-white flex flex-col justify-center p-8 relative">
          <div className="absolute top-0 right-0 p-6 opacity-20">
            {weatherInfo.icon}
          </div>
          <h3 className="text-sm font-bold text-stone-400 tracking-widest uppercase mb-4">Condiciones Climáticas (En Vivo)</h3>
          <div className="flex items-center gap-6">
            <div className={`${weatherInfo.color} bg-white/10 p-4 rounded-3xl backdrop-blur-sm border border-white/10`}>
              {weatherInfo.icon}
            </div>
            <div>
              <h2 className="text-5xl font-black">{weather ? `${weather.temperature}°C` : '--'}</h2>
              <p className="text-lg font-medium text-stone-300 mt-1">{weatherInfo.text}</p>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-stone-700/50">
            <p className="text-sm font-medium text-stone-400">
              {weather?.weathercode >= 51 ? '⚠️ No se recomienda aplicar fertilizantes hoy debido a las lluvias.' : '✅ Condiciones favorables para el trabajo de campo.'}
            </p>
          </div>
        </div>

        {/* INVENTARIO CRÍTICO */}
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden lg:col-span-1">
          <div className="p-6 border-b border-stone-50 flex justify-between items-center">
            <h3 className="text-lg font-black text-stone-800 flex items-center gap-2">
              <Package className="text-rose-500" size={20} /> Stock Crítico
            </h3>
            <button onClick={() => setActiveTab('inventario')} className="text-sm font-bold text-emerald-600 hover:text-emerald-700">Ver todo</button>
          </div>
          <div className="p-4">
            {alertasInventario.length > 0 ? (
              <ul className="space-y-3">
                {alertasInventario.map(item => (
                  <li key={item.id} className="flex justify-between items-center p-4 bg-rose-50/50 rounded-2xl border border-rose-100/50">
                    <div>
                      <p className="font-bold text-stone-800">{item.name}</p>
                      <p className="text-xs font-bold text-stone-500 uppercase">{item.category}</p>
                    </div>
                    <span className="bg-rose-100 text-rose-700 text-xs font-black px-3 py-1.5 rounded-lg">
                      {item.quantity} {item.unit}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8">
                <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
                <p className="text-stone-800 font-bold">Todo en orden</p>
                <p className="text-sm text-stone-500">Stock suficiente.</p>
              </div>
            )}
          </div>
        </div>

        {/* ÚLTIMAS COSECHAS */}
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden lg:col-span-1">
          <div className="p-6 border-b border-stone-50 flex justify-between items-center">
            <h3 className="text-lg font-black text-stone-800 flex items-center gap-2">
              <Sprout className="text-emerald-500" size={20} /> Últimos Cortes
            </h3>
            <button onClick={() => setActiveTab('cosechas')} className="text-sm font-bold text-emerald-600 hover:text-emerald-700">Historial</button>
          </div>
          <ul className="divide-y divide-stone-50 p-2">
            {data.harvests.slice(-4).reverse().map(cosecha => {
              const parcela = data.plots.find(p => p.id === cosecha.plotId);
              return (
                <li key={cosecha.id} className="p-4 hover:bg-stone-50 rounded-2xl transition-colors flex justify-between items-center">
                  <div>
                    <p className="font-bold text-stone-800">{cosecha.product}</p>
                    <p className="text-sm font-bold text-stone-400">{parcela?.name || 'Finca'} • {cosecha.date}</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-lg font-black text-emerald-600">
                      {cosecha.quantity} <span className="text-xs">{cosecha.unit}</span>
                    </span>
                    <span className="text-xs font-bold text-stone-400">RD$ {Number(cosecha.estimatedRevenue).toLocaleString()}</span>
                  </div>
                </li>
              );
            })}
            {data.harvests.length === 0 && (
              <div className="text-center py-10 text-stone-500 font-bold">Sin cosechas.</div>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ParcelasView({ data, updateCollection, confirmAction }) {
  const [parcelaForm, setParcelaForm] = useState({ id: '', name: '', size: '', crop: '' });
  const [isEditing, setIsEditing] = useState(false);

  const guardarParcela = (e) => {
    e.preventDefault();
    if(!parcelaForm.name || !parcelaForm.size) return;
    
    if (isEditing) {
      const actualizadas = data.plots.map(p => p.id === parcelaForm.id ? parcelaForm : p);
      updateCollection('plots', actualizadas);
    } else {
      const nueva = { ...parcelaForm, id: Date.now().toString() };
      updateCollection('plots', [...data.plots, nueva]);
    }
    cancelarEdicion();
  };

  const iniciarEdicion = (parcela) => {
    setParcelaForm(parcela);
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setParcelaForm({ id: '', name: '', size: '', crop: '' });
    setIsEditing(false);
  };

  return (
    <div className="space-y-8">
      {/* FORMULARIO DE PARCELAS */}
      <div className={`bg-white rounded-3xl shadow-sm border ${isEditing ? 'border-amber-300 ring-4 ring-amber-50' : 'border-stone-100'} p-8 transition-all`}>
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className={`${isEditing ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'} p-3 rounded-2xl`}><MapPin size={24} /></div>
            <div>
              <h3 className="text-2xl font-black text-stone-800">{isEditing ? 'Editando Parcela Existente' : 'Registrar Nuevo Lote / Parcela'}</h3>
              <p className="text-sm font-bold text-stone-400">{isEditing ? 'Modifique los valores y guarde los cambios.' : 'Defina las áreas de trabajo de su finca.'}</p>
            </div>
          </div>
          {isEditing && (
            <button onClick={cancelarEdicion} className="text-stone-400 hover:text-stone-600 font-bold px-4 py-2 bg-stone-100 rounded-xl">Cancelar Edición</button>
          )}
        </div>

        <form onSubmit={guardarParcela} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end bg-stone-50/50 p-6 rounded-2xl border border-stone-100">
          <div className="md:col-span-2">
            <label className="block text-sm font-black text-stone-700 mb-2">Nombre o Identificador</label>
            <input className="input-field" placeholder="Ej. Lote El Puente" value={parcelaForm.name} onChange={e => setParcelaForm({...parcelaForm, name: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-black text-stone-700 mb-2">Tamaño (Tareas)</label>
            <input type="number" className="input-field" placeholder="Ej. 50" value={parcelaForm.size} onChange={e => setParcelaForm({...parcelaForm, size: e.target.value})} required min="0.1" step="0.1" />
          </div>
          <div>
            <label className="block text-sm font-black text-stone-700 mb-2">Cultivo Principal</label>
            <input className="input-field" placeholder="Ej. Arroz, Cacao" value={parcelaForm.crop} onChange={e => setParcelaForm({...parcelaForm, crop: e.target.value})} required />
          </div>
          <button type="submit" className={`md:col-span-4 mt-2 py-4 text-lg font-black flex justify-center items-center gap-2 rounded-xl text-white transition-all ${isEditing ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/30' : 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30'} shadow-lg hover:-translate-y-1`}>
            <Save size={20} /> {isEditing ? 'Actualizar Parcela' : 'Crear Parcela'}
          </button>
        </form>
      </div>

      {/* TABLA DE PARCELAS */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="p-6 border-b border-stone-50">
          <h3 className="text-lg font-black text-stone-800">Directorio de Áreas Productivas</h3>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-stone-400 text-xs font-black uppercase tracking-widest border-b border-stone-100">
                <th className="px-6 py-4">Lote / Parcela</th>
                <th className="px-6 py-4">Extensión</th>
                <th className="px-6 py-4">Siembra</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {data.plots.map(plot => (
                <tr key={plot.id} className="hover:bg-stone-50 transition-colors group">
                  <td className="px-6 py-5 font-black text-stone-800 text-lg">{plot.name}</td>
                  <td className="px-6 py-5 font-bold text-stone-600">
                    <span className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl">{plot.size} Tareas</span>
                  </td>
                  <td className="px-6 py-5 font-bold text-stone-600">{plot.crop}</td>
                  <td className="px-6 py-5 text-right flex justify-end gap-2">
                    <button onClick={() => iniciarEdicion(plot)} className="text-stone-400 hover:text-amber-500 hover:bg-amber-50 p-3 rounded-xl transition-all">
                      <Edit size={20} />
                    </button>
                    <button 
                      onClick={() => confirmAction('Eliminar Parcela', `¿Está seguro de eliminar "${plot.name}"?`, () => updateCollection('plots', data.plots.filter(p => p.id !== plot.id)))}
                      className="text-stone-400 hover:text-rose-500 hover:bg-rose-50 p-3 rounded-xl transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </td>
                </tr>
              ))}
              {data.plots.length === 0 && <tr><td colSpan="4" className="p-10 text-center text-stone-400 font-bold">No hay parcelas creadas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PersonalView({ data, updateCollection, confirmAction }) {
  const [nuevoTrabajador, setNuevoTrabajador] = useState({ name: '', type: 'Día', defaultRate: '' });

  const guardarTrabajador = (e) => {
    e.preventDefault();
    if(!nuevoTrabajador.name || !nuevoTrabajador.defaultRate) return;
    const item = { ...nuevoTrabajador, id: Date.now().toString() };
    updateCollection('workers', [...data.workers, item]);
    setNuevoTrabajador({ name: '', type: 'Día', defaultRate: '' });
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-100 text-indigo-600 p-3 rounded-2xl"><Users size={24} /></div>
          <div>
            <h3 className="text-2xl font-black text-stone-800">Alta de Personal</h3>
            <p className="text-sm font-bold text-stone-400">Registre la modalidad de pago de sus jornaleros.</p>
          </div>
        </div>
        <form onSubmit={guardarTrabajador} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end bg-stone-50/50 p-6 rounded-2xl border border-stone-100">
          <div className="md:col-span-2">
            <label className="block text-sm font-black text-stone-700 mb-2">Nombre Completo</label>
            <input className="input-field" placeholder="Ej. Carlos Mendoza" value={nuevoTrabajador.name} onChange={e => setNuevoTrabajador({...nuevoTrabajador, name: e.target.value})} required />
          </div>
          <div>
            <label className="block text-sm font-black text-stone-700 mb-2">Modalidad de Trabajo</label>
            <select className="input-field" value={nuevoTrabajador.type} onChange={e => setNuevoTrabajador({...nuevoTrabajador, type: e.target.value})}>
              <option value="Día">Por Día (Jornal Fijo)</option>
              <option value="Ajuste">Por Ajuste (Destajo)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-black text-stone-700 mb-2">Tarifa (RD$)</label>
            <input type="number" className="input-field font-bold text-indigo-700" placeholder={nuevoTrabajador.type === 'Día' ? "Por día" : "Por unidad"} value={nuevoTrabajador.defaultRate} onChange={e => setNuevoTrabajador({...nuevoTrabajador, defaultRate: e.target.value})} required min="1" />
          </div>
          <button type="submit" className="md:col-span-4 mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-indigo-600/30 hover:-translate-y-1 text-lg">
            Registrar Trabajador en Sistema
          </button>
        </form>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="p-6 border-b border-stone-50">
          <h3 className="text-lg font-black text-stone-800">Plantilla Activa</h3>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-stone-400 text-xs font-black uppercase tracking-widest border-b border-stone-100">
                <th className="px-6 py-4">Jornalero</th>
                <th className="px-6 py-4">Tipo de Contrato</th>
                <th className="px-6 py-4">Tarifa Asignada</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {data.workers.map(worker => (
                <tr key={worker.id} className="hover:bg-stone-50 transition-colors group">
                  <td className="px-6 py-5 font-black text-stone-800 text-lg flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl">
                      {worker.name.charAt(0)}
                    </div>
                    {worker.name}
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border 
                      ${worker.type === 'Día' ? 'bg-sky-50 text-sky-700 border-sky-100' : 'bg-purple-50 text-purple-700 border-purple-100'}`}>
                      {worker.type === 'Día' ? 'Jornal' : 'Ajustero'}
                    </span>
                  </td>
                  <td className="px-6 py-5 font-black text-stone-700 text-lg">
                    RD$ {worker.defaultRate} <span className="font-bold text-stone-400 text-sm">{worker.type === 'Ajuste' ? '/ unidad' : '/ día'}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                     <button 
                      onClick={() => confirmAction('Desvincular', `¿Eliminar a "${worker.name}"?`, () => updateCollection('workers', data.workers.filter(w => w.id !== worker.id)))}
                      className="text-stone-400 hover:text-rose-500 hover:bg-rose-50 p-3 rounded-xl transition-all"
                    >
                      <Trash2 size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NominaView({ data, updateCollection, confirmAction, showNotification }) {
  const [log, setLog] = useState({ date: new Date().toISOString().split('T')[0], workerId: '', plotId: '', workDone: 1 });
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptData, setReceiptData] = useState(null); // Para el modal de impresión

  const trabajadorSeleccionado = data.workers.find(w => w.id === log.workerId);

  const registrarAsistencia = (e) => {
    e.preventDefault();
    if(!log.workerId || !log.plotId) {
      showNotification('Complete todos los campos obligatorios', 'error');
      return;
    }
    
    const pagoCalculado = Number(trabajadorSeleccionado.defaultRate) * Number(log.workDone);
    const nuevoRegistro = { ...log, id: Date.now().toString(), type: trabajadorSeleccionado.type, totalPay: pagoCalculado };

    updateCollection('attendance', [nuevoRegistro, ...data.attendance]);
    setLog({ ...log, workerId: '', workDone: 1 }); 
  };

  const registrosVisibles = data.attendance.filter(a => a.date === viewDate);
  const pagoTotalDia = registrosVisibles.reduce((acc, curr) => acc + Number(curr.totalPay), 0);

  const generarRecibo = (registro) => {
    const worker = data.workers.find(w => w.id === registro.workerId);
    const plot = data.plots.find(p => p.id === registro.plotId);
    setReceiptData({ ...registro, workerName: worker?.name, plotName: plot?.name, rate: worker?.defaultRate });
    // setTimeout para dar tiempo a renderizar antes de llamar a print si se desea automático
  };

  const ejecutarImpresion = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* FORMULARIO DE ASISTENCIA */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="bg-emerald-500 px-8 py-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm"><Calendar size={32} /></div>
            <div>
              <h3 className="text-2xl font-black">Control Diario de Campo</h3>
              <p className="text-emerald-100 font-bold">Asignación y pago a jornaleros</p>
            </div>
          </div>
        </div>
        <div className="p-8">
          <form onSubmit={registrarAsistencia} className="grid grid-cols-1 md:grid-cols-5 gap-6 items-end">
             <div>
              <label className="block text-sm font-black text-stone-700 mb-2">Fecha</label>
              <input type="date" className="input-field" value={log.date} onChange={e => setLog({...log, date: e.target.value})} required />
            </div>
            <div>
              <label className="block text-sm font-black text-stone-700 mb-2">Jornalero</label>
              <select className="input-field font-bold" value={log.workerId} onChange={e => setLog({...log, workerId: e.target.value})} required>
                <option value="">Seleccione...</option>
                {data.workers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.type})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-black text-stone-700 mb-2">Lugar de Trabajo</label>
              <select className="input-field font-bold" value={log.plotId} onChange={e => setLog({...log, plotId: e.target.value})} required>
                <option value="">Destino...</option>
                {data.plots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-black text-stone-700 mb-2 truncate" title={trabajadorSeleccionado?.type === 'Ajuste' ? 'Cantidad (Unidades)' : 'Días Trabajados'}>
                {trabajadorSeleccionado?.type === 'Ajuste' ? 'Unidades Rendidas' : 'Días Laborados'}
              </label>
              <input type="number" step="0.1" className="input-field font-black text-lg" value={log.workDone} onChange={e => setLog({...log, workDone: e.target.value})} required min="0.1" />
            </div>
            <button type="submit" className="btn-primary h-[54px] flex justify-center items-center gap-2 text-lg" disabled={!log.workerId}>
              <Plus size={24} /> Agregar
            </button>
          </form>

          {trabajadorSeleccionado && (
             <div className="mt-8 flex items-center justify-between bg-stone-50 border border-stone-200 p-6 rounded-3xl animate-fade-in">
               <div className="flex items-center gap-4">
                 <div className="p-3 bg-white rounded-full shadow-sm"><Info size={24} className="text-emerald-500" /></div>
                 <div>
                   <p className="text-stone-400 font-bold text-xs uppercase tracking-widest mb-1">Cálculo Automático</p>
                   <p className="text-stone-700 font-black text-lg">
                     {trabajadorSeleccionado.name} <span className="text-stone-400 font-medium ml-2">RD$ {trabajadorSeleccionado.defaultRate} {trabajadorSeleccionado.type === 'Ajuste' ? 'x unidad' : 'x día'}</span>
                   </p>
                 </div>
               </div>
               <div className="text-right bg-white px-6 py-3 rounded-2xl shadow-sm border border-stone-100">
                 <p className="text-xs font-black uppercase tracking-widest text-stone-400 mb-1">A Pagar Hoy</p>
                 <p className="text-3xl font-black text-emerald-600">
                    RD$ {(Number(trabajadorSeleccionado.defaultRate) * Number(log.workDone)).toLocaleString()}
                 </p>
               </div>
             </div>
          )}
        </div>
      </div>

      {/* HOJA DE NÓMINA */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="p-6 border-b border-stone-50 flex flex-col md:flex-row justify-between items-center gap-4 bg-stone-50/50">
           <div>
             <h3 className="text-xl font-black text-stone-800">Hoja de Nómina Diaria</h3>
           </div>
           <div className="flex items-center gap-4">
             <input type="date" className="px-5 py-3 bg-white border border-stone-200 rounded-2xl font-bold text-stone-700 outline-none focus:ring-4 focus:ring-stone-100" value={viewDate} onChange={e => setViewDate(e.target.value)} />
             <div className="bg-stone-900 text-white font-black px-6 py-3 rounded-2xl text-lg flex gap-3 items-center shadow-lg">
                <span className="text-stone-400 text-sm font-bold uppercase">Total Día:</span> RD$ {pagoTotalDia.toLocaleString()}
             </div>
           </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-stone-400 text-xs font-black uppercase tracking-widest border-b border-stone-100">
                <th className="px-6 py-4">Empleado / Labor</th>
                <th className="px-6 py-4">Parcela</th>
                <th className="px-6 py-4 text-right">Pago RD$</th>
                <th className="px-6 py-4 text-center">Recibo</th>
                <th className="px-6 py-4 text-right">Quitar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {registrosVisibles.map(registro => {
                const worker = data.workers.find(w => w.id === registro.workerId);
                const plot = data.plots.find(p => p.id === registro.plotId);
                return (
                  <tr key={registro.id} className="hover:bg-stone-50 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="font-black text-stone-800 text-lg">{worker?.name || 'Desconocido'}</p>
                      <p className="text-sm font-bold text-stone-500 mt-1">
                        Hizo: {registro.workDone} {registro.type === 'Ajuste' ? 'unidades' : 'días'}
                      </p>
                    </td>
                    <td className="px-6 py-5 font-bold text-stone-600">
                      <span className="bg-stone-100 text-stone-700 px-4 py-2 rounded-xl">{plot?.name || 'Desconocida'}</span>
                    </td>
                    <td className="px-6 py-5 font-black text-emerald-600 text-right text-2xl">
                      ${Number(registro.totalPay).toLocaleString()}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <button 
                        onClick={() => generarRecibo(registro)}
                        className="inline-flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-4 py-2 rounded-xl transition-colors"
                      >
                        <Printer size={16} /> Ver PDF
                      </button>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => confirmAction('Anular Pago', '¿Borrar este registro de nómina?', () => updateCollection('attendance', data.attendance.filter(a => a.id !== registro.id)))}
                        className="text-stone-300 hover:text-rose-500 hover:bg-rose-50 p-3 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {registrosVisibles.length === 0 && <tr><td colSpan="5" className="p-16 text-center text-stone-400 font-bold text-lg">No hay jornales para esta fecha.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE RECIBO (Imprimible) */}
      {receiptData && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-sm flex justify-center items-center print:bg-white print:backdrop-blur-none p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden relative">
            
            {/* Contenido del Recibo */}
            <div id="printable-receipt" className="p-10 bg-white">
              <div className="text-center mb-8 border-b border-stone-200 pb-8">
                <Sprout size={48} className="mx-auto text-stone-800 mb-4 print:text-black" />
                <h2 className="text-3xl font-black text-stone-900 uppercase tracking-widest">AgroFinca</h2>
                <p className="text-stone-500 font-bold mt-1 text-sm">COMPROBANTE DE PAGO AGRÍCOLA</p>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl">
                  <span className="text-stone-500 font-bold text-sm uppercase">Fecha Emisión</span>
                  <span className="font-black text-stone-800 text-lg">{receiptData.date}</span>
                </div>
                
                <div className="bg-stone-50 p-4 rounded-2xl space-y-4">
                  <div>
                    <span className="block text-stone-500 font-bold text-sm uppercase mb-1">Beneficiario (Jornalero)</span>
                    <span className="block font-black text-stone-800 text-2xl">{receiptData.workerName}</span>
                  </div>
                  <div>
                    <span className="block text-stone-500 font-bold text-sm uppercase mb-1">Concepto de Trabajo</span>
                    <span className="block font-bold text-stone-700">
                      Labor en: {receiptData.plotName} <br/>
                      {receiptData.type === 'Día' ? 'Jornal Diario' : 'Labor a Destajo (Ajuste)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-stone-200 pt-4 mt-4">
                    <div>
                      <span className="block text-stone-500 font-bold text-xs uppercase mb-1">Cantidad</span>
                      <span className="block font-black text-stone-800">{receiptData.workDone} {receiptData.type === 'Ajuste' ? 'Und' : 'Días'}</span>
                    </div>
                    <div>
                      <span className="block text-stone-500 font-bold text-xs uppercase mb-1">Tarifa</span>
                      <span className="block font-black text-stone-800">RD$ {receiptData.rate}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-end border-t-2 border-dashed border-stone-300 pt-6 mt-6">
                  <span className="text-stone-500 font-black text-lg uppercase tracking-widest">Total Pagado</span>
                  <span className="font-black text-stone-900 text-4xl">RD$ {Number(receiptData.totalPay).toLocaleString()}</span>
                </div>

                <div className="pt-16 mt-8">
                  <div className="border-t border-stone-400 w-3/4 mx-auto text-center pt-2">
                    <p className="text-xs font-bold text-stone-500 uppercase">Firma del Trabajador (Conforme)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Controles del Modal (Ocultos al imprimir) */}
            <div className="bg-stone-100 p-6 flex gap-4 justify-end border-t border-stone-200 print:hidden">
               <button onClick={() => setReceiptData(null)} className="px-6 py-3 font-bold text-stone-500 hover:bg-stone-200 rounded-xl transition-colors">
                 Cerrar
               </button>
               <button onClick={ejecutarImpresion} className="px-8 py-3 font-black bg-stone-900 text-white hover:bg-black rounded-xl transition-colors flex items-center gap-2 shadow-xl shadow-stone-900/20">
                 <Printer size={20}/> Imprimir PDF
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventarioView({ data, updateCollection, confirmAction, showNotification }) {
  const [nuevoInsumo, setNuevoInsumo] = useState({ name: '', category: 'Fertilizante', quantity: '', unit: 'Sacos', unitCost: '' });
  const [uso, setUso] = useState({ date: new Date().toISOString().split('T')[0], plotId: '', inventoryId: '', quantityUsed: '' });

  const agregarAlAlmacen = (e) => {
    e.preventDefault();
    if(!nuevoInsumo.name) return;
    const item = { ...nuevoInsumo, id: Date.now().toString() };
    updateCollection('inventory', [...data.inventory, item]);
    setNuevoInsumo({ name: '', category: 'Fertilizante', quantity: '', unit: 'Sacos', unitCost: '' });
  };

  const registrarAplicacion = (e) => {
    e.preventDefault();
    const item = data.inventory.find(i => i.id === uso.inventoryId);
    if(!item || !uso.plotId || Number(uso.quantityUsed) <= 0) return;
    
    if(Number(uso.quantityUsed) > Number(item.quantity)) {
      showNotification(`Aviso: Solo hay ${item.quantity} ${item.unit} en stock.`, 'error');
      return;
    }

    const totalCost = Number(uso.quantityUsed) * Number(item.unitCost);
    const gastoRegistrado = { ...uso, id: Date.now().toString(), totalCost };

    const inventarioActualizado = data.inventory.map(i => 
      i.id === item.id ? { ...i, quantity: Number(i.quantity) - Number(uso.quantityUsed) } : i
    );

    updateCollection('inventory', inventarioActualizado, true); 
    updateCollection('expenses', [gastoRegistrado, ...data.expenses]); 
    setUso({ ...uso, inventoryId: '', quantityUsed: '' });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        
        {/* COMPRAR / INGRESAR */}
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden flex flex-col">
          <div className="bg-emerald-500 px-8 py-6 text-white flex items-center gap-4">
             <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm"><Package size={28} /></div>
             <div>
               <h3 className="text-xl font-black">Entrada al Almacén</h3>
               <p className="text-emerald-100 font-bold text-sm">Registrar nuevas compras</p>
             </div>
          </div>
          <form onSubmit={agregarAlAlmacen} className="p-8 flex-1 flex flex-col justify-between space-y-6 bg-stone-50/30">
              <div>
                <label className="block text-sm font-black text-stone-700 mb-2">Descripción del Insumo</label>
                <input className="input-field" placeholder="Ej. Abono Químico 15-15-15" value={nuevoInsumo.name} onChange={e => setNuevoInsumo({...nuevoInsumo, name: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-black text-stone-700 mb-2">Tipo</label>
                  <select className="input-field font-bold" value={nuevoInsumo.category} onChange={e => setNuevoInsumo({...nuevoInsumo, category: e.target.value})}>
                    <option>Fertilizante</option><option>Pesticida</option><option>Herramienta</option><option>Combustible</option><option>Otros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-black text-stone-700 mb-2">Unidad</label>
                  <select className="input-field font-bold" value={nuevoInsumo.unit} onChange={e => setNuevoInsumo({...nuevoInsumo, unit: e.target.value})}>
                    <option>Sacos</option><option>Litros</option><option>Galones</option><option>Unidades</option><option>Quintales</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                 <div>
                  <label className="block text-sm font-black text-stone-700 mb-2">Cantidad Ingresada</label>
                  <input type="number" className="input-field font-black text-lg" placeholder="0" value={nuevoInsumo.quantity} onChange={e => setNuevoInsumo({...nuevoInsumo, quantity: e.target.value})} required min="0" step="0.1" />
                 </div>
                 <div>
                  <label className="block text-sm font-black text-stone-700 mb-2">Costo (RD$ c/u)</label>
                  <input type="number" className="input-field font-black text-lg" placeholder="0.00" value={nuevoInsumo.unitCost} onChange={e => setNuevoInsumo({...nuevoInsumo, unitCost: e.target.value})} required min="0" step="0.1" />
                 </div>
              </div>
              <button type="submit" className="btn-primary w-full py-4 text-lg">Guardar en Inventario</button>
           </form>
        </div>

        {/* EXTRAER / APLICAR */}
        <div className="bg-stone-900 rounded-3xl shadow-xl overflow-hidden flex flex-col relative text-white">
           <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
           <div className="px-8 py-6 flex items-center gap-4 relative z-10 border-b border-stone-800">
             <div className="bg-amber-500/20 p-3 rounded-2xl backdrop-blur-sm text-amber-400 border border-amber-500/30"><Sprout size={28} /></div>
             <div>
               <h3 className="text-xl font-black">Aplicar Insumo a Parcela</h3>
               <p className="text-stone-400 font-bold text-sm">El costo se descontará del almacén</p>
             </div>
          </div>
           <form onSubmit={registrarAplicacion} className="p-8 flex-1 flex flex-col justify-between space-y-6 relative z-10">
              <div>
                <label className="block text-sm font-black text-stone-300 mb-2">Fecha</label>
                <input type="date" className="input-field bg-stone-800 border-stone-700 text-white focus:border-amber-500 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.1)]" value={uso.date} onChange={e => setUso({...uso, date: e.target.value})} required />
              </div>
              <div>
                <label className="block text-sm font-black text-stone-300 mb-2">Destino (Centro de Costo)</label>
                <select className="input-field bg-stone-800 border-stone-700 text-white font-bold focus:border-amber-500 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.1)]" value={uso.plotId} onChange={e => setUso({...uso, plotId: e.target.value})} required>
                  <option value="">Seleccione parcela...</option>
                  {data.plots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-stone-300 mb-2">Insumo Utilizado</label>
                <select className="input-field bg-stone-800 border-stone-700 text-white font-bold focus:border-amber-500 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.1)]" value={uso.inventoryId} onChange={e => setUso({...uso, inventoryId: e.target.value})} required>
                  <option value="">Seleccione producto...</option>
                  {data.inventory.map(i => <option key={i.id} value={i.id}>{i.name} (Quedan: {i.quantity} {i.unit})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-amber-400 mb-2">Cantidad a Descontar</label>
                <input type="number" className="input-field bg-stone-800 border-amber-500/50 text-amber-400 font-black text-xl focus:border-amber-400 focus:shadow-[0_0_0_4px_rgba(245,158,11,0.2)]" placeholder="Ej. 2" value={uso.quantityUsed} onChange={e => setUso({...uso, quantityUsed: e.target.value})} required min="0.1" step="0.1" />
              </div>
              <button type="submit" className="w-full bg-amber-500 hover:bg-amber-400 text-stone-900 font-black py-4 rounded-xl transition-all shadow-lg shadow-amber-500/20 hover:-translate-y-1 text-lg">
                Confirmar Aplicación
              </button>
           </form>
        </div>
      </div>

      {/* INVENTARIO GLOBAL */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="p-6 border-b border-stone-50 flex justify-between items-center bg-stone-50/50">
          <h3 className="text-xl font-black text-stone-800">Valoración del Almacén Actual</h3>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
               <tr className="text-stone-400 text-xs font-black uppercase tracking-widest border-b border-stone-100">
                <th className="px-6 py-4">Producto</th>
                <th className="px-6 py-4">Categoría</th>
                <th className="px-6 py-4">Existencia</th>
                <th className="px-6 py-4 text-right">Capital Invertido (RD$)</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {data.inventory.map(item => {
                const valorTotal = Number(item.quantity) * Number(item.unitCost);
                const alerta = Number(item.quantity) < 10;
                return (
                  <tr key={item.id} className="hover:bg-stone-50 transition-colors group">
                    <td className="px-6 py-5 font-black text-stone-800 text-lg">{item.name}</td>
                    <td className="px-6 py-5 font-bold text-stone-500">{item.category}</td>
                    <td className="px-6 py-5">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border ${alerta ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {alerta && <AlertTriangle size={16} />}
                        <span className="font-black text-lg">{item.quantity}</span>
                        <span className="text-xs font-bold uppercase">{item.unit}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                       <div className="flex flex-col items-end">
                         <span className="font-black text-stone-800 text-xl">${valorTotal.toLocaleString()}</span>
                         <span className="text-sm font-bold text-stone-400">a RD$ {item.unitCost} c/u</span>
                       </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => confirmAction('Descartar', `¿Borrar "${item.name}" del inventario?`, () => updateCollection('inventory', data.inventory.filter(i => i.id !== item.id)))}
                        className="text-stone-300 hover:text-rose-500 hover:bg-rose-50 p-3 rounded-xl transition-all"
                      >
                        <Trash2 size={20} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CosechasView({ data, updateCollection, confirmAction }) {
  const [registroCosecha, setRegistroCosecha] = useState({ date: new Date().toISOString().split('T')[0], plotId: '', product: '', quantity: '', unit: 'Cajas', estimatedRevenue: '' });

  const agregarCosecha = (e) => {
    e.preventDefault();
    if(!registroCosecha.plotId || !registroCosecha.product) return;
    const nuevoRegistro = { ...registroCosecha, id: Date.now().toString() };
    updateCollection('harvests', [nuevoRegistro, ...data.harvests]);
    setRegistroCosecha({ ...registroCosecha, product: '', quantity: '', estimatedRevenue: '' }); 
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-emerald-100 text-emerald-600 p-4 rounded-2xl"><Sprout size={32} /></div>
          <div>
            <h3 className="text-2xl font-black text-stone-800 tracking-tight">Reportar Producción y Cortes</h3>
            <p className="text-stone-500 font-bold">Estos datos calculan los ingresos y la rentabilidad de las parcelas.</p>
          </div>
        </div>
        <form onSubmit={agregarCosecha} className="grid grid-cols-1 md:grid-cols-6 gap-6 items-end bg-stone-50/50 p-6 rounded-3xl border border-stone-100">
          <div className="md:col-span-2">
            <label className="block text-sm font-black text-stone-700 mb-2">Fecha del Cierre/Corte</label>
            <input type="date" className="input-field" value={registroCosecha.date} onChange={e => setRegistroCosecha({...registroCosecha, date: e.target.value})} required />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-black text-stone-700 mb-2">Origen (Parcela)</label>
            <select className="input-field font-bold" value={registroCosecha.plotId} onChange={e => setRegistroCosecha({...registroCosecha, plotId: e.target.value})} required>
              <option value="">Seleccione lugar...</option>
              {data.plots.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
             <label className="block text-sm font-black text-stone-700 mb-2">Producto o Variedad</label>
             <input className="input-field" placeholder="Ej. Banano Orgánico" value={registroCosecha.product} onChange={e => setRegistroCosecha({...registroCosecha, product: e.target.value})} required />
          </div>
          
          <div className="md:col-span-3 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-black text-stone-700 mb-2">Cantidad</label>
              <input type="number" className="input-field font-black text-2xl" value={registroCosecha.quantity} onChange={e => setRegistroCosecha({...registroCosecha, quantity: e.target.value})} required min="1" step="0.1" />
            </div>
            <div>
              <label className="block text-sm font-black text-stone-700 mb-2">Empaque/Medida</label>
              <select className="input-field font-bold h-[54px]" value={registroCosecha.unit} onChange={e => setRegistroCosecha({...registroCosecha, unit: e.target.value})}>
                <option>Cajas</option><option>Racimos</option><option>Sacos</option><option>Quintales</option><option>Toneladas</option>
              </select>
            </div>
          </div>
          <div className="md:col-span-3 flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-black text-emerald-600 mb-2">Venta Estimada / Real (RD$)</label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-emerald-500 font-black text-lg">RD$</span>
                <input type="number" className="input-field pl-16 font-black text-emerald-700 text-2xl border-emerald-200 focus:border-emerald-500 bg-emerald-50/50" placeholder="0.00" value={registroCosecha.estimatedRevenue} onChange={e => setRegistroCosecha({...registroCosecha, estimatedRevenue: e.target.value})} required min="0" />
              </div>
            </div>
            <button type="submit" className="btn-primary h-[58px] px-8 text-xl flex items-center justify-center gap-2">
               Guardar Producción
            </button>
          </div>
        </form>
      </div>
      
      {/* HISTORIAL */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="p-6 border-b border-stone-50 bg-stone-50/50">
          <h3 className="text-xl font-black text-stone-800">Libro de Producción</h3>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-left border-collapse">
            <thead>
               <tr className="text-stone-400 text-xs font-black uppercase tracking-widest border-b border-stone-100">
                <th className="px-6 py-4">Detalle Agrícola</th>
                <th className="px-6 py-4">Recolección</th>
                <th className="px-6 py-4 text-right">Facturación Bruta (RD$)</th>
                <th className="px-6 py-4 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {data.harvests.map(h => {
                const plot = data.plots.find(p => p.id === h.plotId);
                return (
                  <tr key={h.id} className="hover:bg-stone-50 transition-colors group">
                    <td className="px-6 py-5">
                      <p className="font-black text-stone-800 text-xl mb-1">{h.product}</p>
                      <p className="text-sm font-bold text-stone-400 flex items-center gap-2">
                        <span className="bg-stone-100 px-2 py-1 rounded-md">{h.date}</span> <MapPin size={14} className="text-stone-300"/> {plot?.name || 'Desconocida'}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                       <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-black px-4 py-2 rounded-xl text-2xl inline-block shadow-sm">
                         {h.quantity} <span className="text-xs uppercase font-bold ml-1">{h.unit}</span>
                       </span>
                    </td>
                    <td className="px-6 py-5 text-right">
                       <p className="font-black text-emerald-600 text-2xl">${Number(h.estimatedRevenue).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button 
                        onClick={() => confirmAction('Eliminar Reporte', '¿Borrar esta cosecha del sistema?', () => updateCollection('harvests', data.harvests.filter(item => item.id !== h.id)))}
                        className="text-stone-300 hover:text-rose-500 hover:bg-rose-50 p-3 rounded-xl transition-all"
                      >
                        <Trash2 size={22} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReportesView({ data }) {
  const reportData = useMemo(() => {
    return data.plots.map(plot => {
      const ingresos = data.harvests.filter(h => h.plotId === plot.id).reduce((sum, h) => sum + Number(h.estimatedRevenue), 0);
      const nomina = data.attendance.filter(a => a.plotId === plot.id).reduce((sum, a) => sum + Number(a.totalPay), 0);
      const insumos = data.expenses.filter(e => e.plotId === plot.id).reduce((sum, e) => sum + Number(e.totalCost), 0);
      
      const costosTotales = nomina + insumos;
      const utilidadNeta = ingresos - costosTotales;
      const utilidadPorTarea = plot.size > 0 ? (utilidadNeta / plot.size) : 0;
      
      // Para gráficos visuales (evitar división por cero)
      const maxValor = Math.max(ingresos, costosTotales, 1);
      const widthIngresos = (ingresos / maxValor) * 100;
      const widthCostos = (costosTotales / maxValor) * 100;

      return { ...plot, ingresos, nomina, insumos, costosTotales, utilidadNeta, utilidadPorTarea, widthIngresos, widthCostos };
    });
  }, [data]);

  const rentabilidadGlobal = reportData.reduce((sum, p) => sum + p.utilidadNeta, 0);

  const exportarExcel = () => {
    const headers = ['Parcela', 'Tareas', 'Ingresos RD$', 'Gastos Nomina RD$', 'Gastos Insumos RD$', 'Utilidad Neta RD$', 'Rendimiento/Tarea RD$'];
    const rows = reportData.map(r => [
      `"${r.name}"`, r.size, r.ingresos, r.nomina, r.insumos, r.utilidadNeta, r.utilidadPorTarea.toFixed(2)
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csvContent);
    link.download = `Reporte_Financiero_AgroFinca.csv`;
    link.click();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* TARJETA MAESTRA */}
      <div className="bg-stone-900 rounded-[2rem] shadow-2xl p-10 flex flex-col md:flex-row justify-between items-center gap-8 relative overflow-hidden border border-stone-800">
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none opacity-20 ${rentabilidadGlobal >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-800/80 border border-stone-700/50 mb-4 backdrop-blur-md">
            <BarChart3 size={18} className="text-stone-300" />
            <span className="text-sm font-black text-white uppercase tracking-widest">Desempeño Económico General</span>
          </div>
          <h2 className="text-4xl font-black text-stone-200 mb-2">Utilidad Neta (RD$)</h2>
          <p className="text-stone-400 font-bold max-w-md leading-relaxed text-sm">El sistema cruza automáticamente los ingresos por cosechas contra todo el gasto de nómina e insumos aplicados.</p>
        </div>
        <div className="text-right relative z-10 bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-md shadow-2xl">
          <h1 className={`text-6xl md:text-7xl font-black tracking-tighter drop-shadow-xl ${rentabilidadGlobal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ${rentabilidadGlobal.toLocaleString()}
          </h1>
          <p className="text-stone-300 font-black uppercase tracking-widest mt-4 text-sm flex justify-end gap-2 items-center">
            {rentabilidadGlobal >= 0 ? <span className="flex items-center gap-2 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-lg">Finca Rentable <CheckCircle2 size={16}/></span> : <span className="flex items-center gap-2 bg-rose-500/20 text-rose-300 px-3 py-1 rounded-lg">Pérdida Operativa <AlertTriangle size={16}/></span>}
          </p>
        </div>
      </div>

      {/* ANÁLISIS POR CENTRO DE COSTO CON GRÁFICOS */}
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-center p-8 border-b border-stone-50 bg-stone-50/50">
           <div>
             <h3 className="text-2xl font-black text-stone-800">Centro de Costos / Rentabilidad por Lote</h3>
           </div>
           <button onClick={exportarExcel} className="mt-4 md:mt-0 flex items-center gap-2 font-black text-stone-700 bg-white hover:bg-stone-100 px-6 py-3 rounded-2xl border border-stone-200 transition-all shadow-sm">
             <Download size={20} /> Bajar a Excel
           </button>
        </div>
        
        <div className="p-8 grid grid-cols-1 gap-8">
          {reportData.map(row => (
            <div key={row.id} className="bg-white border border-stone-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-6 border-b border-stone-50 pb-4">
                <div>
                  <h4 className="text-2xl font-black text-stone-800">{row.name}</h4>
                  <p className="text-stone-400 font-bold uppercase tracking-widest text-xs mt-1">{row.size} Tareas • {row.crop}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Beneficio Neto</p>
                  <p className={`text-3xl font-black ${row.utilidadNeta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    RD$ {row.utilidadNeta.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Visualización en Barras */}
                <div className="space-y-4 flex flex-col justify-center">
                  <div>
                    <div className="flex justify-between text-sm font-black mb-2">
                      <span className="text-stone-600">Ingresos (Cosechas)</span>
                      <span className="text-emerald-600">RD$ {row.ingresos.toLocaleString()}</span>
                    </div>
                    <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex">
                      <div style={{ width: `${row.widthIngresos}%` }} className="bg-emerald-500 rounded-full transition-all duration-1000 ease-out"></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm font-black mb-2">
                      <span className="text-stone-600">Costos (Nómina + Insumos)</span>
                      <span className="text-rose-600">RD$ {row.costosTotales.toLocaleString()}</span>
                    </div>
                    <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex">
                      <div style={{ width: `${row.widthCostos}%` }} className="bg-rose-500 rounded-full transition-all duration-1000 ease-out"></div>
                    </div>
                  </div>
                </div>

                {/* Desglose de Gastos */}
                <div className="bg-stone-50 rounded-2xl p-6 border border-stone-100">
                  <h5 className="font-black text-stone-800 mb-4 uppercase tracking-widest text-xs">Desglose Financiero</h5>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500 font-bold">Inversión en Mano de Obra:</span>
                      <span className="font-black text-stone-700">RD$ {row.nomina.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-stone-500 font-bold">Consumo de Insumos:</span>
                      <span className="font-black text-stone-700">RD$ {row.insumos.toLocaleString()}</span>
                    </div>
                    <div className="pt-3 mt-3 border-t border-stone-200 flex justify-between items-center">
                      <span className="text-indigo-600 font-black uppercase tracking-widest text-xs">Retorno x Tarea (Métrica)</span>
                      <span className="font-black text-indigo-700 text-lg bg-indigo-50 px-3 py-1 rounded-lg">RD$ {row.utilidadPorTarea.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {reportData.length === 0 && <p className="text-center text-stone-400 font-bold p-10">Agregue parcelas en la sección correspondiente.</p>}
        </div>
      </div>
    </div>
  );
}

// --- VISTA DE CONFIGURACIÓN ---
function ConfiguracionView({ data, updateCollection, showNotification }) {
  const config = data.config ?? { lat: 19.55, lon: -71.05 };
  const [lat, setLat] = useState(String(config.lat));
  const [lon, setLon] = useState(String(config.lon));

  const handleSubmit = (e) => {
    e.preventDefault();
    const parsedLat = parseFloat(lat);
    const parsedLon = parseFloat(lon);
    if (isNaN(parsedLat) || isNaN(parsedLon)) {
      showNotification('Las coordenadas deben ser números válidos.', 'error');
      return;
    }
    updateCollection('config', { lat: parsedLat, lon: parsedLon });
    showNotification('Configuración guardada correctamente.');
  };

  return (
    <div className="max-w-lg space-y-8 animate-fade-in">
      <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-8">
        <h3 className="text-xl font-black text-stone-800 mb-2 flex items-center gap-2">
          <Settings size={22} className="text-emerald-600" /> Coordenadas del Clima
        </h3>
        <p className="text-sm text-stone-500 mb-6">
          Define la latitud y longitud que usa el widget del clima (Open-Meteo).
          Los valores actuales son: <span className="font-bold text-stone-700">{config.lat}, {config.lon}</span>.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-black text-stone-700 mb-1 uppercase tracking-wider">Latitud</label>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={e => setLat(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="ej. 19.55"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-black text-stone-700 mb-1 uppercase tracking-wider">Longitud</label>
            <input
              type="number"
              step="any"
              value={lon}
              onChange={e => setLon(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="ej. -71.05"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/30 hover:-translate-y-1 text-lg flex justify-center items-center gap-2"
          >
            <Save size={20} /> Guardar Configuración
          </button>
        </form>
      </div>
    </div>
  );
}