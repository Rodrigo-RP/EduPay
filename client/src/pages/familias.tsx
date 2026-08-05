import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { generateCiclosList, getCurrentCiclo } from "@/hooks/use-academic-filter";
import { Home, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Users, CreditCard, FileText, Link2, Download, Upload, AlertCircle, AlertTriangle, Eye, UserCheck, UserX, Settings, FileSpreadsheet } from "lucide-react";

export default function Familias() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSeccion, setSelectedSeccion]       = useState("all");
  const [selectedGrado, setSelectedGrado]           = useState("all");
  const [selectedGrupo, setSelectedGrupo]           = useState("all");
  const [selectedEstatus, setSelectedEstatus]       = useState("all");
  const [selectedCodigoPostal, setSelectedCodigoPostal] = useState("all");
  const [selectedCicloFamilias, setSelectedCicloFamilias]       = useState("all");
  const [selectedPeriodoFamilias, setSelectedPeriodoFamilias]   = useState("all");
  const [selectedEstadoCivil, setSelectedEstadoCivil]           = useState("all");
  const [selectedHermanos, setSelectedHermanos]                 = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters]           = useState(false);
  const [showResumenFamilias, setShowResumenFamilias]           = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<any>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingFamily, setViewingFamily] = useState<any>(null);
  
  // Estados para importación Excel
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    // Datos Generales
    numero_familia: "",
    // Padre/Tutor Principal - Campos separados
    padre_nombres: "",
    padre_primer_apellido: "",
    padre_segundo_apellido: "",
    padre_telefono: "",
    padre_email: "",
    padre_ocupacion: "",
    padre_empresa: "",
    // Madre/Tutora - Campos separados
    madre_nombres: "",
    madre_primer_apellido: "",
    madre_segundo_apellido: "",
    madre_telefono: "",
    madre_email: "",
    madre_ocupacion: "",
    madre_empresa: "",
    // Dirección
    direccion: "",
    colonia: "",
    ciudad: "",
    estado: "Ciudad de México",
    codigo_postal: "",
    // Datos de Facturación (mantenido para compatibilidad)
    razon_social: "",
    rfc: "",
    email_facturacion: "",
    direccion_fiscal: "",
    uso_cfdi: "G03",
    metodo_pago: "PUE",
    forma_pago: "03",
    // Contactos Adicionales
    contacto_emergencia_nombre: "",
    contacto_emergencia_telefono: "",
    contacto_emergencia_relacion: "",
    // Observaciones
    observaciones: "",
    estatus: "activo",
    // Campos de acceso al portal
    usuario: "",
    password: "",
    id_referencia_padre: "",
    id_referencia_madre: ""
  });

  // Estado para múltiples datos fiscales
  const [datosFiscales, setDatosFiscales] = useState([
    {
      id: 1,
      razon_social: "",
      rfc: "",
      email_facturacion: "",
      direccion_fiscal: "",
      uso_cfdi: "G03",
      metodo_pago: "PUE",
      forma_pago: "03",
      es_principal: true
    }
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [familias, setFamilias] = useState<any[]>([]);

  // Cargar familias reales desde la API
  useEffect(() => {
    async function loadFamilias() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const token = localStorage.getItem("auth_token");
        const userData = localStorage.getItem("auth_user");
        const user = userData ? JSON.parse(userData) : null;
        const campusId = user?.campus_id;
        if (!campusId) {
          setLoadError("No se encontró campus del usuario. Inicia sesión nuevamente.");
          return;
        }
        const res = await fetch(`/api/families/${campusId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
        const data: any[] = await res.json();
        // Normalizar campos para compatibilidad con la UI existente
        const normalized = data.map((f) => ({
          ...f,
          numero_familia: `FAM${String(f.id).padStart(3, "0")}`,
          padre_nombre: f.nombre,
          padre_telefono: "",
          padre_email: "",
          madre_nombre: "",
          madre_telefono: "",
          madre_email: "",
          direccion: "",
          ciudad: "Querétaro",
          codigo_postal: f.codigo_postal || f.cp || "",
          razon_social: f.nombre,
          rfc: "",
          estatus: "activo",
          // La API devuelve estudiantes bajo "estudiantes"
          estudiantes_vinculados: (f.estudiantes || []).map((s: any) => ({
            id: s.id,
            nombre: s.nombre_completo,
            grado: `${s.grado || ""} ${s.grupo || ""}`.trim(),
            nivel_escolar: s.nivel_escolar || "",
            grado_raw: s.grado || "",
            grupo: s.grupo || "",
          })),
          saldo_total: f.saldo_pendiente_centavos ?? 0,
          fecha_registro: f.created_at ? f.created_at.split("T")[0] : "",
        }));
        setFamilias(normalized);
      } catch (err: any) {
        setLoadError(err.message || "Error al cargar familias");
      } finally {
        setIsLoading(false);
      }
    }
    loadFamilias();
  }, []);

  // ── PLACEHOLDER (mantenido para que los formularios de alta sigan funcionando) ──
  const _unusedPlaceholder = [
    {
      id: 1,
      numero_familia: "FAM001",
      padre_nombre: "Carlos Pérez García",
      padre_telefono: "5551234567",
      padre_email: "carlos.perez@gmail.com",
      madre_nombre: "Ana Méndez López",
      madre_telefono: "5551234568",
      madre_email: "ana.mendez@gmail.com",
      direccion: "Av. Insurgentes 123, Col. Roma Norte",
      ciudad: "Ciudad de México",
      codigo_postal: "06700",
      razon_social: "Carlos Pérez García",
      rfc: "PEGC850515ABC",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 1, nombre: "Carlos Pérez Méndez", grado: "3ro A" }
      ],
      saldo_total: 500000,
      fecha_registro: "2024-08-15"
    },
    {
      id: 2,
      numero_familia: "FAM002",
      padre_nombre: "Roberto García Hernández",
      padre_telefono: "5559876543",
      padre_email: "roberto.garcia@hotmail.com",
      madre_nombre: "Ana Luna Martínez",
      madre_telefono: "5559876544",
      madre_email: "ana.luna@yahoo.com",
      direccion: "Calle Reforma 456, Col. Centro",
      ciudad: "Ciudad de México",
      codigo_postal: "06000",
      razon_social: "Roberto García Hernández",
      rfc: "GAHR780312XYZ",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 2, nombre: "Andrea García Luna", grado: "2do B" }
      ],
      saldo_total: 535000,
      fecha_registro: "2024-08-16"
    },
    {
      id: 3,
      numero_familia: "FAM003",
      padre_nombre: "Luis Martínez Rodríguez",
      padre_telefono: "5554567890",
      padre_email: "luis.martinez@empresa.com",
      madre_nombre: "María Gil Fernández",
      madre_telefono: "5554567891",
      madre_email: "maria.gil@gmail.com",
      direccion: "Av. Universidad 789, Col. Del Valle",
      ciudad: "Ciudad de México",
      codigo_postal: "03100",
      razon_social: "Servicios Martínez S.A. de C.V.",
      rfc: "SMA201015ABC",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 11, nombre: "Luis Martínez Gil", grado: "3ro C" }
      ],
      saldo_total: 620000,
      fecha_registro: "2024-08-17"
    },
    {
      id: 4,
      numero_familia: "FAM004",
      padre_nombre: "José Santos Morales",
      padre_telefono: "5551234567",
      padre_email: "jose.santos@gmail.com",
      madre_nombre: "María Rivera Santos",
      madre_telefono: "5551234568",
      madre_email: "maria.rivera@gmail.com",
      direccion: "Av. Universidad 1234, Col. Del Valle",
      ciudad: "Ciudad de México",
      codigo_postal: "03100",
      razon_social: "José Santos Morales",
      rfc: "SAMJ850215ABC",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 1, nombre: "Emilia Santos Rivera", grado: "Kinder 1 A" }
      ],
      saldo_total: 480000,
      fecha_registro: "2024-08-15"
    },
    {
      id: 5,
      numero_familia: "FAM005",
      padre_nombre: "Roberto Hernández Villa",
      padre_telefono: "5557788990",
      padre_email: "roberto.hernandez@gmail.com",
      madre_nombre: "Silvia Castro Mendoza",
      madre_telefono: "5557788991",
      madre_email: "silvia.castro@outlook.com",
      direccion: "Av. Universidad 901, Col. Narvarte",
      ciudad: "Ciudad de México",
      codigo_postal: "03020",
      razon_social: "Roberto Hernández Villa",
      rfc: "HEVR870806ZAB",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 19, nombre: "Sofía Hernández Castro", grado: "1ro Sec A" }
      ],
      saldo_total: 720000,
      fecha_registro: "2024-08-24"
    },
    {
      id: 6,
      numero_familia: "FAM006",
      padre_nombre: "Fernando Morales Castro",
      padre_telefono: "5555566778",
      padre_email: "fernando.morales@outlook.com",
      madre_nombre: "Carmen Ruiz Herrera",
      madre_telefono: "5555566779",
      madre_email: "carmen.ruiz@gmail.com",
      direccion: "Calle Tlalpan 567, Col. Doctores",
      ciudad: "Ciudad de México",
      codigo_postal: "06720",
      razon_social: "Fernando Morales Castro",
      rfc: "MOCF790320XYZ",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 27, nombre: "Isabella Morales Ruiz", grado: "2do Bach B" }
      ],
      saldo_total: 870000,
      fecha_registro: "2024-08-28"
    },
    {
      id: 7,
      numero_familia: "FAM007",
      padre_nombre: "Alejandro Castillo Vega",
      padre_telefono: "5557788990",
      padre_email: "alejandro.castillo@gmail.com",
      madre_nombre: "Gabriela Mendoza Castillo",
      madre_telefono: "5557788991",
      madre_email: "gabriela.mendoza@yahoo.com",
      direccion: "Calle Miramontes 678, Col. Coapa",
      ciudad: "Ciudad de México",
      codigo_postal: "14300",
      razon_social: "Alejandro Castillo Vega",
      rfc: "CAVA851015MNO",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 29, nombre: "Alejandro Castillo Mendoza", grado: "3ro Bach A" }
      ],
      saldo_total: 890000,
      fecha_registro: "2024-08-29"
    },
    {
      id: 8,
      numero_familia: "FAM008",
      padre_nombre: "Jorge Ramírez Salinas",
      padre_telefono: "5553344556",
      padre_email: "jorge.ramirez@hotmail.com",
      madre_nombre: "Patricia Silva Ramírez",
      madre_telefono: "5553344557",
      madre_email: "patricia.silva@gmail.com",
      direccion: "Calle Niños Héroes 123, Col. Doctores",
      ciudad: "Ciudad de México",
      codigo_postal: "06720",
      razon_social: "Jorge Ramírez Salinas",
      rfc: "RASJ851220EFG",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 25, nombre: "Diego Ramírez Silva", grado: "1ro Bach A" },
        { id: 12, nombre: "Isabella Ramírez Cordova", grado: "3ro A" }
      ],
      saldo_total: 1320000,
      fecha_registro: "2024-08-20"
    },
    {
      id: 9,
      numero_familia: "FAM009",
      padre_nombre: "Roberto Torres Medina",
      padre_telefono: "5559900112",
      padre_email: "roberto.torres@outlook.com",
      madre_nombre: "Carmen Vega Torres",
      madre_telefono: "5559900113",
      madre_email: "carmen.vega@gmail.com",
      direccion: "Calle Zapata 789, Col. Portales",
      ciudad: "Ciudad de México",
      codigo_postal: "03300",
      razon_social: "Roberto Torres Medina",
      rfc: "TOMR880306YZA",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 21, nombre: "Miguel Torres Vega", grado: "2do Sec B" },
        { id: 10, nombre: "Matías Torres Silva", grado: "2do A" }
      ],
      saldo_total: 1340000,
      fecha_registro: "2024-08-19"
    },
    {
      id: 10,
      numero_familia: "FAM010",
      padre_nombre: "Eduardo López Mendoza",
      padre_telefono: "5551122334",
      padre_email: "eduardo.lopez@gmail.com",
      madre_nombre: "Sandra Cruz Morales",
      madre_telefono: "5551122335",
      madre_email: "sandra.cruz@hotmail.com",
      direccion: "Av. Insurgentes Sur 567, Col. Roma Sur",
      ciudad: "Ciudad de México",
      codigo_postal: "06760",
      razon_social: "Eduardo López Mendoza",
      rfc: "LOME851230TUV",
      estatus: "activo",
      estudiantes_vinculados: [
        { id: 23, nombre: "Valeria López Cruz", grado: "3ro Sec C" }
      ],
      saldo_total: 760000,
      fecha_registro: "2024-08-26"
    }
  ]; // _unusedPlaceholder — solo referencia para los formularios de alta

  // Lista de estudiantes disponibles para vincular
  const estudiantesDisponibles = [
    { id: 1, nombre_completo: "Carlos Pérez Méndez", grado: "3ro", grupo: "A" },
    { id: 2, nombre_completo: "Andrea García Luna", grado: "2do", grupo: "B" },
    { id: 3, nombre_completo: "Luis Martínez Gil", grado: "1ro", grupo: "C" },
    { id: 4, nombre_completo: "Diego Martínez Gil", grado: "Kinder", grupo: "C" },
    { id: 5, nombre_completo: "Sofía Hernández Castro", grado: "5to", grupo: "A" },
    { id: 6, nombre_completo: "Miguel Torres Vega", grado: "4to", grupo: "B" }
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Funciones para manejar múltiples datos fiscales
  const handleFiscalDataChange = (index: number, field: string, value: string) => {
    setDatosFiscales(prev => 
      prev.map((dato, i) => 
        i === index ? { ...dato, [field]: value } : dato
      )
    );
  };

  const addFiscalData = () => {
    const newId = Math.max(...datosFiscales.map(d => d.id)) + 1;
    setDatosFiscales(prev => [...prev, {
      id: newId,
      razon_social: "",
      rfc: "",
      email_facturacion: "",
      direccion_fiscal: "",
      uso_cfdi: "G03",
      metodo_pago: "PUE",
      forma_pago: "03",
      es_principal: false
    }]);
  };

  const removeFiscalData = (index: number) => {
    if (datosFiscales.length > 1) {
      setDatosFiscales(prev => prev.filter((_, i) => i !== index));
    }
  };

  const setPrincipalFiscalData = (index: number) => {
    setDatosFiscales(prev => 
      prev.map((dato, i) => ({
        ...dato,
        es_principal: i === index
      }))
    );
  };

  // Función para combinar nombres separados en nombre completo
  const combineNames = (nombres: string, primerApellido: string, segundoApellido: string) => {
    const parts = [nombres, primerApellido, segundoApellido].filter(part => part.trim());
    return parts.join(' ');
  };

  const resetForm = () => {
    setFormData({
      numero_familia: "",
      padre_nombres: "",
      padre_primer_apellido: "",
      padre_segundo_apellido: "",
      padre_telefono: "",
      padre_email: "",
      padre_ocupacion: "",
      padre_empresa: "",
      madre_nombres: "",
      madre_primer_apellido: "",
      madre_segundo_apellido: "",
      madre_telefono: "",
      madre_email: "",
      madre_ocupacion: "",
      madre_empresa: "",
      direccion: "",
      colonia: "",
      ciudad: "",
      estado: "Ciudad de México",
      codigo_postal: "",
      razon_social: "",
      rfc: "",
      email_facturacion: "",
      direccion_fiscal: "",
      uso_cfdi: "G03",
      metodo_pago: "PUE",
      forma_pago: "03",
      contacto_emergencia_nombre: "",
      contacto_emergencia_telefono: "",
      contacto_emergencia_relacion: "",
      observaciones: "",
      estatus: "activo",
      usuario: "",
      password: "",
      id_referencia_padre: "",
      id_referencia_madre: ""
    });
    
    // Resetear datos fiscales múltiples
    setDatosFiscales([
      {
        id: 1,
        razon_social: "",
        rfc: "",
        email_facturacion: "",
        direccion_fiscal: "",
        uso_cfdi: "G03",
        metodo_pago: "PUE",
        forma_pago: "03",
        es_principal: true
      }
    ]);
  };

  // Funciones para importación Excel de familias
  const downloadFamilyTemplate = () => {
    const headers = [
      "padre_nombres",
      "padre_primer_apellido",
      "padre_segundo_apellido",
      "padre_telefono",
      "padre_email",
      "padre_ocupacion",
      "padre_empresa",
      "madre_nombres",
      "madre_primer_apellido", 
      "madre_segundo_apellido",
      "madre_telefono",
      "madre_email",
      "madre_ocupacion",
      "madre_empresa",
      "direccion",
      "colonia",
      "ciudad",
      "estado",
      "codigo_postal",
      "razon_social",
      "rfc",
      "email_facturacion",
      "direccion_fiscal",
      "uso_cfdi",
      "metodo_pago",
      "forma_pago",
      "contacto_emergencia_nombre",
      "contacto_emergencia_telefono",
      "contacto_emergencia_relacion",
      "observaciones",
      "estatus"
    ];
    
    const exampleData = [
      [
        "Carlos Alberto",
        "García",
        "Mendoza",
        "5551234567",
        "carlos.garcia@gmail.com",
        "Ingeniero",
        "Tecnología SA",
        "María Elena",
        "López",
        "Castro",
        "5551234568",
        "maria.lopez@gmail.com",
        "Doctora",
        "Hospital General",
        "Av. Insurgentes 123, Col. Roma Norte",
        "Roma Norte",
        "Ciudad de México",
        "Ciudad de México",
        "06700",
        "Carlos García López",
        "GALC850315AB2",
        "facturacion@garcia.com",
        "Av. Insurgentes 123, Col. Roma Norte",
        "G03",
        "PUE",
        "03",
        "Rosa Castro",
        "5557654321",
        "Abuela",
        "Familia responsable",
        "activo"
      ],
      [
        "José Luis",
        "Hernández",
        "Martínez",
        "5559876543",
        "jose.hernandez@hotmail.com",
        "Contador",
        "Contabilidad Pro",
        "Ana Patricia",
        "Ruiz",
        "Flores",
        "5559876544",
        "ana.ruiz@yahoo.com",
        "Maestra",
        "Primaria Benito Juárez",
        "Calle Reforma 456, Col. Centro",
        "Centro",
        "Ciudad de México",
        "Ciudad de México",
        "06000",
        "José Luis Hernández Martínez",
        "HEMJ800220XY8",
        "contabilidad@hernandez.com",
        "Calle Reforma 456, Col. Centro",
        "G01",
        "PPD",
        "04",
        "Pedro Martínez",
        "5556543210",
        "Tío",
        "Familia trabajadora",
        "activo"
      ],
      [
        "Miguel Ángel",
        "Rodríguez",
        "Pérez",
        "5552468135",
        "miguel.rodriguez@empresa.com",
        "Gerente",
        "Corporativo XYZ",
        "Sofía Gabriela",
        "Sánchez",
        "Morales",
        "5552468136",
        "sofia.sanchez@gmail.com",
        "Arquitecta",
        "Diseño y Construcción",
        "Av. Universidad 789, Col. Del Valle",
        "Del Valle",
        "Ciudad de México",
        "Ciudad de México",
        "03100",
        "Miguel Ángel Rodríguez Pérez",
        "ROPM750410CD5",
        "facturas@rodriguez.com",
        "Av. Universidad 789, Col. Del Valle",
        "G03",
        "PUE",
        "03",
        "Carmen Morales",
        "5553698741",
        "Hermana",
        "Familia estable",
        "activo"
      ]
    ];
    
    // Crear CSV con BOM UTF-8 para compatibilidad con Excel
    const csvContent = "\uFEFF" + [headers, ...exampleData].map(row => 
      row.map(cell => `"${cell}"`).join(",")
    ).join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_familias.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Plantilla descargada",
      description: "La plantilla Excel ha sido descargada exitosamente con nombres separados para padre y madre (33 campos) y 3 ejemplos de familias.",
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      toast({
        title: "Archivo seleccionado",
        description: `${file.name} está listo para importar.`,
      });
    }
  };

  const processExcelImport = async () => {
    if (!importFile) return;
    
    setIsImporting(true);
    setImportProgress(0);
    
    try {
      const text = await importFile.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const newFamilies: any[] = [];
      
      // Procesar cada línea (excluyendo encabezados)
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const family: any = { id: Date.now() + i };
          
          headers.forEach((header, index) => {
            if (values[index]) {
              family[header] = values[index];
            }
          });
          
          // Combinar nombres del padre en padre_nombre
          const padreNombres = family.padre_nombres || "";
          const padrePrimerApellido = family.padre_primer_apellido || "";
          const padreSegundoApellido = family.padre_segundo_apellido || "";
          family.padre_nombre = `${padreNombres} ${padrePrimerApellido} ${padreSegundoApellido}`.trim();
          
          // Combinar nombres de la madre en madre_nombre
          const madreNombres = family.madre_nombres || "";
          const madrePrimerApellido = family.madre_primer_apellido || "";
          const madreSegundoApellido = family.madre_segundo_apellido || "";
          family.madre_nombre = `${madreNombres} ${madrePrimerApellido} ${madreSegundoApellido}`.trim();
          
          // Generar número de familia automáticamente
          family.numero_familia = `FAM${String(Date.now() + i).slice(-3)}`;
          
          // Generar datos fiscales múltiples con la información del CSV
          family.datos_fiscales = [
            {
              id: 1,
              razon_social: family.razon_social || family.padre_nombre || "",
              rfc: family.rfc || "",
              email_facturacion: family.email_facturacion || family.padre_email || "",
              direccion_fiscal: family.direccion_fiscal || family.direccion || "",
              uso_cfdi: family.uso_cfdi || "G03",
              metodo_pago: family.metodo_pago || "PUE",
              forma_pago: family.forma_pago || "03",
              es_principal: true
            }
          ];
          
          // Agregar propiedades adicionales
          family.estudiantes_vinculados = [];
          family.saldo_total = 0;
          family.fecha_registro = new Date().toISOString().split('T')[0];
          
          newFamilies.push(family);
        }
        
        // Actualizar progreso
        setImportProgress(Math.round((i / lines.length) * 100));
      }
      
      // Agregar familias al estado
      setFamilias(prev => [...prev, ...newFamilies]);
      
      toast({
        title: "Importación exitosa",
        description: `Se importaron ${newFamilies.length} familias correctamente.`,
      });
      
      // Limpiar formulario
      setImportFile(null);
      setShowAddModal(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
    } catch (error) {
      toast({
        title: "Error en importación",
        description: "Hubo un error al procesar el archivo Excel.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const loadFamilyForEdit = (familia: any) => {
    // Separar nombres existentes para el formulario
    const padreNombreParts = familia.padre_nombre?.split(' ') || [];
    const madreNombreParts = familia.madre_nombre?.split(' ') || [];
    
    setFormData({
      numero_familia: familia.numero_familia,
      padre_nombres: padreNombreParts[0] || "",
      padre_primer_apellido: padreNombreParts[1] || "",
      padre_segundo_apellido: padreNombreParts[2] || "",
      padre_telefono: familia.padre_telefono,
      padre_email: familia.padre_email || "",
      padre_ocupacion: familia.padre_ocupacion || "",
      padre_empresa: familia.padre_empresa || "",
      madre_nombres: madreNombreParts[0] || "",
      madre_primer_apellido: madreNombreParts[1] || "",
      madre_segundo_apellido: madreNombreParts[2] || "",
      madre_telefono: familia.madre_telefono || "",
      madre_email: familia.madre_email || "",
      madre_ocupacion: familia.madre_ocupacion || "",
      madre_empresa: familia.madre_empresa || "",
      direccion: familia.direccion || "",
      colonia: familia.colonia || "",
      ciudad: familia.ciudad || "",
      estado: familia.estado || "Ciudad de México",
      codigo_postal: familia.codigo_postal || "",
      razon_social: familia.razon_social || "",
      rfc: familia.rfc || "",
      email_facturacion: familia.email_facturacion || "",
      direccion_fiscal: familia.direccion_fiscal || "",
      uso_cfdi: familia.uso_cfdi || "G03",
      metodo_pago: familia.metodo_pago || "PUE",
      forma_pago: familia.forma_pago || "03",
      contacto_emergencia_nombre: familia.contacto_emergencia_nombre || "",
      contacto_emergencia_telefono: familia.contacto_emergencia_telefono || "",
      contacto_emergencia_relacion: familia.contacto_emergencia_relacion || "",
      observaciones: familia.observaciones || "",
      estatus: familia.estatus || "activo",
      usuario: familia.usuario || "",
      password: familia.password || "",
      id_referencia_padre: familia.id_referencia_padre || "",
      id_referencia_madre: familia.id_referencia_madre || ""
    });
    
    // Cargar múltiples datos fiscales si existen
    if (familia.datos_fiscales && familia.datos_fiscales.length > 0) {
      setDatosFiscales(familia.datos_fiscales);
    } else {
      // Si no hay datos fiscales múltiples, usar los datos fiscales existentes
      setDatosFiscales([
        {
          id: 1,
          razon_social: familia.razon_social || "",
          rfc: familia.rfc || "",
          email_facturacion: familia.email_facturacion || "",
          direccion_fiscal: familia.direccion_fiscal || "",
          uso_cfdi: familia.uso_cfdi || "G03",
          metodo_pago: familia.metodo_pago || "PUE",
          forma_pago: familia.forma_pago || "03",
          es_principal: true
        }
      ]);
    }
    
    setEditingFamily(familia);
    setShowEditModal(true);
  };

  // Función para cargar familia en modo visualización
  const loadFamilyForView = (familia: any) => {
    setViewingFamily(familia);
    setShowViewModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.padre_nombres || !formData.padre_primer_apellido || !formData.padre_telefono) {
      toast({
        title: "Error",
        description: "Por favor complete los campos obligatorios: nombres del padre, primer apellido y teléfono.",
        variant: "destructive"
      });
      return;
    }

    // Validar RFC si se proporciona (compatibilidad)
    if (formData.rfc && formData.rfc.length < 12) {
      toast({
        title: "Error",
        description: "El RFC debe tener al menos 12 caracteres.",
        variant: "destructive"
      });
      return;
    }

    // Validar datos fiscales múltiples
    const invalidRfc = datosFiscales.find(dato => dato.rfc && dato.rfc.length < 12);
    if (invalidRfc) {
      toast({
        title: "Error",
        description: "Todos los RFC deben tener al menos 12 caracteres.",
        variant: "destructive"
      });
      return;
    }

    // Validar que haya al menos un RFC principal
    const principalRfc = datosFiscales.find(dato => dato.es_principal);
    if (!principalRfc) {
      toast({
        title: "Error",
        description: "Debe seleccionar un RFC como principal.",
        variant: "destructive"
      });
      return;
    }

    // Combinar nombres separados para compatibilidad
    const padreNombreCompleto = combineNames(
      formData.padre_nombres, 
      formData.padre_primer_apellido, 
      formData.padre_segundo_apellido
    );
    const madreNombreCompleto = combineNames(
      formData.madre_nombres, 
      formData.madre_primer_apellido, 
      formData.madre_segundo_apellido
    );

    if (editingFamily) {
      // Actualizar familia existente
      const updatedFamily = {
        ...editingFamily,
        padre_nombre: padreNombreCompleto,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: madreNombreCompleto,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || padreNombreCompleto,
        rfc: formData.rfc,
        estatus: formData.estatus,
        // Incluir múltiples datos fiscales
        datos_fiscales: datosFiscales
      };

      setFamilias(prev => prev.map(f => f.id === editingFamily.id ? updatedFamily : f));
      
      toast({
        title: "Familia actualizada",
        description: `Los datos de la familia ${formData.padre_primer_apellido} han sido actualizados exitosamente.`
      });

      resetForm();
      setEditingFamily(null);
      setShowEditModal(false);
    } else {
      // Crear nueva familia
      const newId = Math.max(...familias.map(f => f.id)) + 1;
      const numeroFamilia = `FAM${String(newId).padStart(3, '0')}`;
      
      const newFamily = {
        id: newId,
        numero_familia: numeroFamilia,
        padre_nombre: padreNombreCompleto,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: madreNombreCompleto,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || padreNombreCompleto,
        rfc: formData.rfc,
        estatus: formData.estatus,
        estudiantes_vinculados: [],
        saldo_total: 0,
        fecha_registro: new Date().toISOString().split('T')[0],
        // Incluir múltiples datos fiscales
        datos_fiscales: datosFiscales
      };

      setFamilias(prev => [...prev, newFamily]);
      
      toast({
        title: "Familia registrada",
        description: `La familia ${formData.padre_primer_apellido} ha sido registrada exitosamente con número ${numeroFamilia}.`
      });

      resetForm();
      setShowAddModal(false);
    }
  };

  const handleDelete = (familiaId: number) => {
    const familia = familias.find(f => f.id === familiaId);
    if (familia && familia.estudiantes_vinculados.length > 0) {
      toast({
        title: "No se puede eliminar",
        description: "Esta familia tiene estudiantes vinculados. Primero desvincule los estudiantes.",
        variant: "destructive"
      });
      return;
    }

    setFamilias(prev => prev.filter(f => f.id !== familiaId));
    toast({
      title: "Familia eliminada",
      description: "La familia ha sido eliminada exitosamente."
    });
  };

  // ── Opciones derivadas de los datos reales ─────────────────────────────────
  const seccionesBD = Array.from(new Set(
    familias.flatMap(f => f.estudiantes_vinculados.map((s: any) => s.nivel_escolar).filter(Boolean))
  )) as string[];

  const gradosBD = Array.from(new Set(
    familias.flatMap(f => f.estudiantes_vinculados.map((s: any) => s.grado_raw).filter(Boolean))
  )) as string[];

  const gruposBD = Array.from(new Set(
    familias.flatMap(f => f.estudiantes_vinculados.map((s: any) => s.grupo).filter(Boolean))
  )) as string[];

  const codigosPostalesBD = Array.from(new Set(
    familias.map(f => f.codigo_postal).filter(Boolean)
  )) as string[];

  // Filtros predefinidos
  const ciclosFamilias = generateCiclosList();

  const aplicarFiltroPredefinidoFamilias = (tipo: string) => {
    setSearchTerm("");
    setSelectedSeccion("all");
    setSelectedGrado("all");
    setSelectedGrupo("all");
    setSelectedCodigoPostal("all");
    setSelectedCicloFamilias("all");
    setSelectedPeriodoFamilias("all");
    switch (tipo) {
      case 'activos':    setSelectedEstatus("activo");   break;
      case 'pendientes': setSelectedEstatus("pendiente"); break;
      default:           setSelectedEstatus("all");       break;
    }
  };

  // Ocultar lista hasta que haya búsqueda o filtro activo
  const hasActiveSearch = !!(
    searchTerm ||
    selectedSeccion !== "all" ||
    selectedGrado !== "all" ||
    selectedGrupo !== "all" ||
    selectedEstatus !== "all" ||
    selectedCodigoPostal !== "all" ||
    selectedCicloFamilias !== "all" ||
    selectedPeriodoFamilias !== "all" ||
    selectedEstadoCivil !== "all" ||
    selectedHermanos !== "all"
  );

  // Filtrar familias según criterios de búsqueda
  const filteredFamilias = familias.filter(familia => {
    // Texto libre
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = !searchTerm ||
      familia.numero_familia.toLowerCase().includes(searchLower) ||
      familia.padre_nombre.toLowerCase().includes(searchLower) ||
      familia.madre_nombre.toLowerCase().includes(searchLower) ||
      familia.padre_email.toLowerCase().includes(searchLower) ||
      familia.rfc.toLowerCase().includes(searchLower);

    // Estatus
    const matchEstatus = selectedEstatus === "all" || familia.estatus === selectedEstatus;

    // Sección: al menos un alumno vinculado coincide
    const matchSeccion = selectedSeccion === "all" ||
      familia.estudiantes_vinculados.some((s: any) => s.nivel_escolar === selectedSeccion);

    // Grado
    const matchGrado = selectedGrado === "all" ||
      familia.estudiantes_vinculados.some((s: any) => s.grado_raw === selectedGrado);

    // Grupo
    const matchGrupo = selectedGrupo === "all" ||
      familia.estudiantes_vinculados.some((s: any) => s.grupo === selectedGrupo);

    // Código postal
    const matchCP = selectedCodigoPostal === "all" || familia.codigo_postal === selectedCodigoPostal;

    // Ciclo escolar — filtra por el ciclo_escolar del alumno si viene del API, si no pasa
    const matchCiclo = selectedCicloFamilias === "all" ||
      familia.estudiantes_vinculados.some((s: any) => s.ciclo_escolar === selectedCicloFamilias) ||
      (familia.ciclo_escolar || "") === selectedCicloFamilias;

    // Período de registro
    const matchPeriodo = (() => {
      if (selectedPeriodoFamilias === "all") return true;
      const raw = familia.created_at || familia.fecha_registro;
      if (!raw) return true;
      const fecha = new Date(raw);
      const now = new Date();
      if (selectedPeriodoFamilias === "hoy")   return fecha.toDateString() === now.toDateString();
      if (selectedPeriodoFamilias === "semana") return (now.getTime() - fecha.getTime()) <= 7 * 24 * 60 * 60 * 1000;
      if (selectedPeriodoFamilias === "mes")   return fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
      return true;
    })();

    // Estado civil del tutor principal
    const estadoCivil = (familia.estado_civil || familia.padre_estado_civil || familia.madre_estado_civil || "").toLowerCase();
    const matchEstadoCivil = selectedEstadoCivil === "all" || (() => {
      if (selectedEstadoCivil === "padre_soltero")  return estadoCivil === "soltero" && (familia.padre_nombre || "").trim() !== "" && (familia.madre_nombre || "").trim() === "";
      if (selectedEstadoCivil === "madre_soltera")  return estadoCivil === "soltera" || (estadoCivil === "soltero" && (familia.madre_nombre || "").trim() !== "" && (familia.padre_nombre || "").trim() === "");
      if (selectedEstadoCivil === "viudo")          return estadoCivil.includes("viud");
      if (selectedEstadoCivil === "divorciado")     return estadoCivil.includes("divorci");
      return true;
    })();

    // Número de hermanos (hijos vinculados a la familia)
    const numHijos = familia.estudiantes_vinculados?.length ?? 0;
    const numHermanos = Math.max(0, numHijos - 1);
    const matchHermanos = selectedHermanos === "all" || (() => {
      const n = parseInt(selectedHermanos, 10);
      if (selectedHermanos === "5+") return numHermanos >= 5;
      return numHermanos === n;
    })();

    return matchSearch && matchEstatus && matchSeccion && matchGrado && matchGrupo && matchCP && matchCiclo && matchPeriodo && matchEstadoCivil && matchHermanos;
  });

  // ── Resumen estadístico familias ────────────────────────────────────────
  const buildResumenFamilias = () => {
    const count = (arr: any[], pred: (f: any) => boolean) => arr.filter(pred).length;
    const byKey = (arr: any[], getter: (f: any) => string) => {
      const map: Record<string, number> = {};
      arr.forEach(f => { const k = getter(f) || "Sin dato"; map[k] = (map[k] || 0) + 1; });
      return Object.entries(map).sort((a, b) => b[1] - a[1]);
    };
    return {
      total: filteredFamilias.length,
      porEstatus:     byKey(filteredFamilias, f => f.estatus),
      porNivel:       byKey(filteredFamilias, f => f.estudiantes_vinculados?.[0]?.nivel_escolar || "Sin nivel"),
      porEstadoCivil: byKey(filteredFamilias, f => f.estado_civil || f.padre_estado_civil || f.madre_estado_civil || "No especificado"),
      porHermanos: [0,1,2,3,4].map(n => ({
        label: n === 0 ? "Hijo único" : `${n} hermano${n > 1 ? "s" : ""}`,
        count: count(filteredFamilias, f => Math.max(0, (f.estudiantes_vinculados?.length ?? 1) - 1) === n),
      })).concat([{ label: "5+ hermanos", count: count(filteredFamilias, f => Math.max(0, (f.estudiantes_vinculados?.length ?? 1) - 1) >= 5) }]),
      padresSolteros:  count(filteredFamilias, f => {
        const ec = (f.estado_civil || "").toLowerCase();
        return ec === "soltero" || ec === "soltera";
      }),
      viudos:      count(filteredFamilias, f => (f.estado_civil || "").toLowerCase().includes("viud")),
      divorciados: count(filteredFamilias, f => (f.estado_civil || "").toLowerCase().includes("divorci")),
    };
  };

  const exportResumenFamiliasExcel = () => {
    const d = buildResumenFamilias();
    const rows: string[][] = [
      ["RESUMEN DE FAMILIAS", "", ""],
      [`Generado: ${new Date().toLocaleDateString('es-MX')}`, "", ""],
      ["Total filtrado", String(d.total), ""],
      ["", "", ""],
      ["RUBRO", "CATEGORÍA", "CANTIDAD"],
      ...d.porEstatus.map(([k, v]) => ["Estatus", k, String(v)]),
      ...d.porNivel.map(([k, v]) => ["Nivel de hijos", k, String(v)]),
      ...d.porEstadoCivil.map(([k, v]) => ["Estado civil", k, String(v)]),
      ...d.porHermanos.map(r => ["Hermanos", r.label, String(r.count)]),
      ["Indicadores", "Padres/Madres solteros", String(d.padresSolteros)],
      ["Indicadores", "Viudos", String(d.viudos)],
      ["Indicadores", "Divorciados", String(d.divorciados)],
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `resumen_familias_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a); a.click();
    URL.revokeObjectURL(url); document.body.removeChild(a);
    toast({ title: "Excel exportado", description: "Resumen de familias descargado como CSV" });
  };

  const exportResumenFamiliasPDF = () => {
    const d = buildResumenFamilias();
    const tableHtml = (title: string, rows: [string, number][]) =>
      `<h2>${title}</h2><table><tr><th>Categoría</th><th>Cantidad</th></tr>${rows.map(([k,v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumen de Familias</title>
    <style>body{font-family:Arial,sans-serif;padding:20px;color:#1a1a1a}h1{color:#1e40af;font-size:20px}h2{color:#374151;font-size:14px;margin-top:16px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    table{border-collapse:collapse;width:100%;margin-bottom:8px;font-size:12px}th{background:#1e40af;color:#fff;padding:6px 10px;text-align:left}td{padding:5px 10px;border-bottom:1px solid #f3f4f6}
    tr:nth-child(even) td{background:#f9fafb}.meta{color:#6b7280;font-size:12px;margin-bottom:16px}@media print{body{padding:10px}}</style></head><body>
    <h1>Resumen de Familias</h1>
    <p class="meta">Generado: ${new Date().toLocaleDateString('es-MX')} · Total: ${d.total} familia(s)</p>
    ${tableHtml("Por Estatus", d.porEstatus)}
    ${tableHtml("Por Nivel de hijos", d.porNivel)}
    ${tableHtml("Por Estado Civil", d.porEstadoCivil)}
    <h2>Por Número de Hermanos</h2><table><tr><th>Categoría</th><th>Cantidad</th></tr>${d.porHermanos.map(r => `<tr><td>${r.label}</td><td>${r.count}</td></tr>`).join("")}</table>
    <h2>Indicadores especiales</h2><table><tr><th>Indicador</th><th>Cantidad</th></tr>
    <tr><td>Padres/Madres solteros</td><td>${d.padresSolteros}</td></tr>
    <tr><td>Viudos</td><td>${d.viudos}</td></tr>
    <tr><td>Divorciados</td><td>${d.divorciados}</td></tr></table>
    </body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.focus(); win.print(); }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const estadisticas = {
    total: familias.length,
    activas: familias.filter(f => f.estatus === "activo").length,
    saldoTotal: familias.reduce((sum, f) => sum + f.saldo_total, 0),
    promedioHijos: familias.reduce((sum, f) => sum + f.estudiantes_vinculados.length, 0) / familias.length
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600">Cargando familias…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
        <div className="bg-white rounded-xl p-8 shadow-lg border border-red-100 max-w-md text-center">
          <p className="text-red-600 font-semibold mb-2">Error al cargar familias</p>
          <p className="text-slate-500 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-20 w-72 h-72 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl"></div>
        <div className="absolute top-60 right-10 w-56 h-56 bg-gradient-to-br from-purple-400/10 to-pink-400/10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-40 left-1/4 w-64 h-64 bg-gradient-to-br from-cyan-400/10 to-blue-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative z-10 px-4 py-6 md:px-6">
        {/* Header Premium como en Dashboard */}
        <div className="mb-6 md:mb-8 relative">
          <div className="relative bg-white/95 backdrop-blur-sm rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xl border border-white/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative p-4 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl">
                  <Home className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl md:text-3xl font-bold text-blue-600 mb-1">Gestión de Familias</h1>
                  <p className="text-sm md:text-base text-slate-600">Administra datos de padres, tutores y información de facturación</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Agregar Familia
                </Button>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <UserCheck className="w-4 h-4 text-green-500" />
                  Sistema Activo
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards como en el Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Total familias</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">{estadisticas.total}</p>
                  <div className="text-xs text-green-600 mt-1">Registradas</div>
                </div>
                <div className="text-blue-500 flex-shrink-0">
                  <Home className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Familias activas</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">{estadisticas.activas}</p>
                  <div className="text-xs text-green-600 mt-1">Estado saludable</div>
                </div>
                <div className="text-green-500 flex-shrink-0">
                  <Users className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Saldo total pendiente</p>
                  <p className="text-xs md:text-sm font-bold text-blue-600 whitespace-nowrap">${(estadisticas.saldoTotal / 100).toLocaleString()}</p>
                  <div className="text-xs text-orange-600 mt-1">Por cobrar</div>
                </div>
                <div className="text-orange-500 flex-shrink-0">
                  <CreditCard className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Promedio hijos</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600 whitespace-nowrap">{estadisticas.promedioHijos.toFixed(1)}</p>
                  <div className="text-xs text-blue-600 mt-1">Por familia</div>
                </div>
                <div className="text-purple-500 flex-shrink-0">
                  <UserCheck className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 mb-4 md:mb-6">
          <CardContent className="p-6">
            <div className="space-y-4">

              {/* Barra de búsqueda principal */}
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Número, apellidos, nombre, email o RFC..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 text-base"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowResumenFamilias(v => !v)}
                  className="flex items-center gap-2 text-indigo-700 border-indigo-200"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  {showResumenFamilias ? 'Ocultar resumen' : 'Ver resumen'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  {showAdvancedFilters ? 'Ocultar filtros' : 'Más filtros'}
                </Button>
              </div>

              {/* Filtros rápidos */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">Filtros rápidos</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={selectedEstatus === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => aplicarFiltroPredefinidoFamilias('todos')}
                    className="text-xs"
                  >
                    <Users className="h-3 w-3 mr-1" />
                    Todas las familias
                  </Button>
                  <Button
                    variant={selectedEstatus === "activo" ? "default" : "outline"}
                    size="sm"
                    onClick={() => aplicarFiltroPredefinidoFamilias('activos')}
                    className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                  >
                    <UserCheck className="h-3 w-3 mr-1" />
                    Solo activos
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { aplicarFiltroPredefinidoFamilias('todos'); setSelectedSeccion("all"); }}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Nuevos ingresos
                  </Button>
                  <Button
                    variant={selectedEstatus === "pendiente" ? "default" : "outline"}
                    size="sm"
                    onClick={() => aplicarFiltroPredefinidoFamilias('pendientes')}
                    className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Pendientes documentos
                  </Button>
                  {/* Selector de estatus inline */}
                  <Select value={selectedEstatus} onValueChange={setSelectedEstatus}>
                    <SelectTrigger className="h-8 w-36 text-xs border rounded-full px-3 bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100">
                      <SelectValue placeholder="Estatus" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Estatus</SelectItem>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                      <SelectItem value="egresado">Egresado</SelectItem>
                      <SelectItem value="becado">Becado</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fila 1 — Filtros temporales: Ciclo + Período */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ciclo Escolar</Label>
                  <Select value={selectedCicloFamilias} onValueChange={setSelectedCicloFamilias}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos los ciclos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los ciclos</SelectItem>
                      {ciclosFamilias.slice().reverse().map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Período</Label>
                  <Select value={selectedPeriodoFamilias} onValueChange={setSelectedPeriodoFamilias}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todo el tiempo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todo el tiempo</SelectItem>
                      <SelectItem value="hoy">Hoy</SelectItem>
                      <SelectItem value="semana">Esta semana</SelectItem>
                      <SelectItem value="mes">Este mes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fila 2 — Filtros de registro: Nivel · Grado · Grupo · Estatus · CP */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nivel</Label>
                  <Select value={selectedSeccion} onValueChange={setSelectedSeccion}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos los niveles" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las secciones</SelectItem>
                      {['Kinder','Primaria','Secundaria','Preparatoria'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                      {seccionesBD.filter(s => !['Kinder','Primaria','Secundaria','Preparatoria'].includes(s)).map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Grado</Label>
                  <Select value={selectedGrado} onValueChange={setSelectedGrado}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos los grados" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los grados</SelectItem>
                      {gradosBD.sort().map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Grupo</Label>
                  <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos los grupos" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los grupos</SelectItem>
                      {gruposBD.sort().map(g => (
                        <SelectItem key={g} value={g}>Grupo {g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estatus</Label>
                  <Select value={selectedEstatus} onValueChange={setSelectedEstatus}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todos los estatus" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estatus</SelectItem>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Código Postal</Label>
                  <Select value={selectedCodigoPostal} onValueChange={setSelectedCodigoPostal}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Todas las zonas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las zonas</SelectItem>
                      {codigosPostalesBD.sort().map(cp => (
                        <SelectItem key={cp} value={cp}>CP {cp}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Filtros avanzados expandibles */}
              {showAdvancedFilters && (
                <div className="border-t pt-4 mt-2 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {/* Estado civil */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado civil del tutor</Label>
                      <Select value={selectedEstadoCivil} onValueChange={setSelectedEstadoCivil}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="padre_soltero">Padre soltero</SelectItem>
                          <SelectItem value="madre_soltera">Madre soltera</SelectItem>
                          <SelectItem value="viudo">Viudo / Viuda</SelectItem>
                          <SelectItem value="divorciado">Divorciado / Divorciada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Hermanos */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Número de hermanos</Label>
                      <Select value={selectedHermanos} onValueChange={setSelectedHermanos}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="0">Hijo único (0 hermanos)</SelectItem>
                          <SelectItem value="1">1 hermano</SelectItem>
                          <SelectItem value="2">2 hermanos</SelectItem>
                          <SelectItem value="3">3 hermanos</SelectItem>
                          <SelectItem value="4">4 hermanos</SelectItem>
                          <SelectItem value="5+">5 o más hermanos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Acciones */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones</Label>
                      <Button
                        variant="outline" size="sm" className="text-xs w-full"
                        onClick={() => {
                          setSearchTerm(""); setSelectedSeccion("all"); setSelectedGrado("all");
                          setSelectedGrupo("all"); setSelectedEstatus("all");
                          setSelectedCodigoPostal("all"); setSelectedCicloFamilias("all");
                          setSelectedPeriodoFamilias("all"); setSelectedEstadoCivil("all");
                          setSelectedHermanos("all");
                        }}
                      >
                        Limpiar todos los filtros
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Resumen de filtros activos */}
              {hasActiveSearch && (
                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 bg-blue-50 p-2 rounded-md">
                  <span className="font-medium">Filtros activos:</span>
                  {searchTerm && <span className="bg-white border rounded px-2 py-0.5 text-xs">Búsqueda: {searchTerm}</span>}
                  {selectedSeccion !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">Sección: {selectedSeccion}</span>}
                  {selectedGrado !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">Grado: {selectedGrado}</span>}
                  {selectedGrupo !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">Grupo: {selectedGrupo}</span>}
                  {selectedEstatus !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">Estatus: {selectedEstatus}</span>}
                  {selectedCodigoPostal !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">CP: {selectedCodigoPostal}</span>}
                  {selectedCicloFamilias !== "all" && <span className="bg-white border rounded px-2 py-0.5 text-xs">Ciclo: {selectedCicloFamilias}</span>}
                </div>
              )}

            </div>
          </CardContent>
        </Card>

        {/* ── Resumen estadístico familias ──────────────────────────────── */}
        {hasActiveSearch && showResumenFamilias && (() => {
          const d = buildResumenFamilias();
          const StatTable = ({ title, rows }: { title: string; rows: [string, number][] }) => (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
              <table className="w-full text-xs">
                <tbody>
                  {rows.map(([k, v]) => (
                    <tr key={k} className="border-b border-gray-100 last:border-0">
                      <td className="py-1 text-gray-600">{k}</td>
                      <td className="py-1 text-right font-semibold text-gray-800">{v}</td>
                      <td className="py-1 pl-2 w-24">
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 rounded-full"
                            style={{ width: d.total > 0 ? `${Math.round((v / d.total) * 100)}%` : "0%" }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          return (
            <Card className="border-indigo-100 bg-indigo-50/40">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base text-indigo-900">Resumen estadístico</CardTitle>
                    <p className="text-xs text-indigo-600 mt-0.5">
                      {d.total > 0
                        ? `${d.total} familia(s) con los filtros actuales`
                        : "Sin coincidencias para los filtros seleccionados"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={d.total === 0}
                      className="text-xs border-green-300 text-green-700 bg-white hover:bg-green-50"
                      onClick={exportResumenFamiliasExcel}>
                      <FileSpreadsheet className="h-3 w-3 mr-1" /> Exportar Excel
                    </Button>
                    <Button size="sm" variant="outline" disabled={d.total === 0}
                      className="text-xs border-red-300 text-red-700 bg-white hover:bg-red-50"
                      onClick={exportResumenFamiliasPDF}>
                      <Download className="h-3 w-3 mr-1" /> Exportar PDF
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {d.total === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                      <Search className="h-6 w-6 text-indigo-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-600">No hay familias que coincidan</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-xs">
                      Prueba cambiando o quitando algún filtro para ver resultados y su desglose estadístico.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                    <StatTable title="Estatus" rows={d.porEstatus} />
                    <StatTable title="Nivel de hijos" rows={d.porNivel} />
                    <StatTable title="Estado civil" rows={d.porEstadoCivil} />
                    <StatTable title="Hermanos" rows={d.porHermanos.filter(r => r.count > 0).map(r => [r.label, r.count] as [string, number])} />
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Indicadores</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-600">Padres/Madres solteros</span><span className="font-semibold text-blue-700">{d.padresSolteros}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Viudos</span><span className="font-semibold text-gray-700">{d.viudos}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">Divorciados</span><span className="font-semibold text-orange-700">{d.divorciados}</span></div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Lista de familias */}
        <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Home className="w-5 h-5" />
              Familias
              {hasActiveSearch && (
                <span className="text-base font-normal text-slate-500 ml-1">
                  — {filteredFamilias.length} resultado{filteredFamilias.length !== 1 ? 's' : ''}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {!hasActiveSearch ? (
                <div className="py-14 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Busca una familia</p>
                  <p className="text-sm text-slate-500 max-w-xs mx-auto">
                    Ingresa el número de familia, apellidos, email o RFC para ver los resultados.
                  </p>
                </div>
              ) : filteredFamilias.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Home className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 mb-1">Sin resultados</p>
                  <p className="text-sm text-slate-500">Ninguna familia coincide con la búsqueda.</p>
                </div>
              ) : null}
              {hasActiveSearch && filteredFamilias.map((familia) => (
                <div key={familia.id} className="p-6 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border-l-4 border-blue-500">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center">
                        <Home className="w-8 h-8 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-xl text-slate-900">{familia.numero_familia}</h3>
                          <Badge variant={familia.estatus === 'activo' ? 'default' : 'secondary'}
                                 className={familia.estatus === 'activo' ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                            {familia.estatus}
                          </Badge>
                        </div>
                        <h4 className="font-semibold text-lg text-blue-600 mb-3">
                          Familia {familia.padre_nombre || "Sin nombre"}
                        </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="flex items-center gap-2 text-slate-600 mb-1">
                            <Users className="w-4 h-4" />
                            <span className="font-medium">Padre:</span> {familia.padre_nombre}
                          </div>
                          <div className="flex items-center gap-2 text-slate-600 mb-1">
                            <Phone className="w-4 h-4" />
                            <span>{familia.padre_telefono}</span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-600">
                            <Mail className="w-4 h-4" />
                            <span>{familia.padre_email}</span>
                          </div>
                        </div>
                        
                        <div>
                          {familia.madre_nombre && (
                            <>
                              <div className="flex items-center gap-2 text-slate-600 mb-1">
                                <Users className="w-4 h-4" />
                                <span className="font-medium">Madre:</span> {familia.madre_nombre}
                              </div>
                              <div className="flex items-center gap-2 text-slate-600 mb-1">
                                <Phone className="w-4 h-4" />
                                <span>{familia.madre_telefono}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-600">
                                <Mail className="w-4 h-4" />
                                <span>{familia.madre_email}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2 text-slate-600 mb-2">
                          <MapPin className="w-4 h-4" />
                          <span className="text-xs">{familia.direccion}, {familia.ciudad} {familia.codigo_postal}</span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 mb-2">
                          <FileText className="w-4 h-4" />
                          <span className="text-xs">RFC: {familia.rfc} • {familia.razon_social}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-700">Estudiantes vinculados:</span>
                          {familia.estudiantes_vinculados.length > 0 ? (
                            <div className="flex gap-1">
                              {familia.estudiantes_vinculados.map((estudiante: any, index: number) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {estudiante.nombre} ({estudiante.grado})
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Sin estudiantes vinculados</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                      <div className="font-semibold text-lg">${(familia.saldo_total / 100).toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Saldo pendiente</div>
                    </div>
                    <div className="flex space-x-1">
                      <Button size="sm" variant="outline" onClick={() => loadFamilyForView(familia)} title="Ver información de la familia">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedFamily(familia);
                        setShowLinkModal(true);
                      }} title="Vincular estudiantes">
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(familia.id)} title="Eliminar familia"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <UserX className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Modal para agregar/editar familia */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingFamily(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingFamily ? 'Editar Familia' : 'Gestión de Familias'}</DialogTitle>
          </DialogHeader>
          
          {!editingFamily ? (
            <Tabs defaultValue="individual" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="individual">Individual</TabsTrigger>
                <TabsTrigger value="excel">Importar Excel</TabsTrigger>
              </TabsList>

              <TabsContent value="individual" className="space-y-4">
                <form onSubmit={handleSubmit}>
                  <Tabs defaultValue="generales" className="space-y-4">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="generales">Datos Generales</TabsTrigger>
                      <TabsTrigger value="contacto">Contacto y Dirección</TabsTrigger>
                      <TabsTrigger value="facturacion">Facturación</TabsTrigger>
                      <TabsTrigger value="adicional">Información Adicional</TabsTrigger>
                      <TabsTrigger value="credenciales">Credenciales del Portal</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generales" className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Padre/Tutor Principal</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="padre_nombres">Nombres *</Label>
                            <Input
                              id="padre_nombres"
                              value={formData.padre_nombres}
                              onChange={(e) => handleInputChange("padre_nombres", e.target.value)}
                              placeholder="Nombres del padre/tutor"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="padre_primer_apellido">Primer Apellido *</Label>
                            <Input
                              id="padre_primer_apellido"
                              value={formData.padre_primer_apellido}
                              onChange={(e) => handleInputChange("padre_primer_apellido", e.target.value)}
                              placeholder="Primer apellido"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="padre_segundo_apellido">Segundo Apellido</Label>
                            <Input
                              id="padre_segundo_apellido"
                              value={formData.padre_segundo_apellido}
                              onChange={(e) => handleInputChange("padre_segundo_apellido", e.target.value)}
                              placeholder="Segundo apellido"
                            />
                          </div>
                          <div>
                            <Label htmlFor="padre_telefono">Teléfono *</Label>
                            <Input
                              id="padre_telefono"
                              value={formData.padre_telefono}
                              onChange={(e) => handleInputChange("padre_telefono", e.target.value)}
                              placeholder="Teléfono principal"
                              maxLength={10}
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="padre_email">Correo Electrónico</Label>
                            <Input
                              id="padre_email"
                              type="email"
                              value={formData.padre_email}
                              onChange={(e) => handleInputChange("padre_email", e.target.value)}
                              placeholder="Email del padre/tutor"
                            />
                          </div>
                          <div>
                            <Label htmlFor="padre_ocupacion">Ocupación</Label>
                            <Input
                              id="padre_ocupacion"
                              value={formData.padre_ocupacion}
                              onChange={(e) => handleInputChange("padre_ocupacion", e.target.value)}
                              placeholder="Ocupación del padre/tutor"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Label htmlFor="padre_empresa">Empresa</Label>
                            <Input
                              id="padre_empresa"
                              value={formData.padre_empresa}
                              onChange={(e) => handleInputChange("padre_empresa", e.target.value)}
                              placeholder="Empresa donde trabaja"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Madre/Tutora</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="madre_nombres">Nombres</Label>
                            <Input
                              id="madre_nombres"
                              value={formData.madre_nombres}
                              onChange={(e) => handleInputChange("madre_nombres", e.target.value)}
                              placeholder="Nombres de la madre/tutora"
                            />
                          </div>
                          <div>
                            <Label htmlFor="madre_primer_apellido">Primer Apellido</Label>
                            <Input
                              id="madre_primer_apellido"
                              value={formData.madre_primer_apellido}
                              onChange={(e) => handleInputChange("madre_primer_apellido", e.target.value)}
                              placeholder="Primer apellido"
                            />
                          </div>
                          <div>
                            <Label htmlFor="madre_segundo_apellido">Segundo Apellido</Label>
                            <Input
                              id="madre_segundo_apellido"
                              value={formData.madre_segundo_apellido}
                              onChange={(e) => handleInputChange("madre_segundo_apellido", e.target.value)}
                              placeholder="Segundo apellido"
                            />
                          </div>
                          <div>
                            <Label htmlFor="madre_telefono">Teléfono</Label>
                            <Input
                              id="madre_telefono"
                              value={formData.madre_telefono}
                              onChange={(e) => handleInputChange("madre_telefono", e.target.value)}
                              placeholder="Teléfono de la madre/tutora"
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <Label htmlFor="madre_email">Correo Electrónico</Label>
                            <Input
                              id="madre_email"
                              type="email"
                              value={formData.madre_email}
                              onChange={(e) => handleInputChange("madre_email", e.target.value)}
                              placeholder="Email de la madre/tutora"
                            />
                          </div>
                          <div>
                            <Label htmlFor="madre_ocupacion">Ocupación</Label>
                            <Input
                              id="madre_ocupacion"
                              value={formData.madre_ocupacion}
                              onChange={(e) => handleInputChange("madre_ocupacion", e.target.value)}
                              placeholder="Ocupación de la madre/tutora"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Label htmlFor="madre_empresa">Empresa</Label>
                            <Input
                              id="madre_empresa"
                              value={formData.madre_empresa}
                              onChange={(e) => handleInputChange("madre_empresa", e.target.value)}
                              placeholder="Empresa donde trabaja"
                            />
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="contacto" className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Dirección</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="md:col-span-2">
                            <Label htmlFor="direccion">Dirección Completa</Label>
                            <Input
                              id="direccion"
                              value={formData.direccion}
                              onChange={(e) => handleInputChange("direccion", e.target.value)}
                              placeholder="Calle, número, colonia"
                            />
                          </div>
                          <div>
                            <Label htmlFor="ciudad">Ciudad</Label>
                            <Input
                              id="ciudad"
                              value={formData.ciudad}
                              onChange={(e) => handleInputChange("ciudad", e.target.value)}
                              placeholder="Ciudad"
                            />
                          </div>
                          <div>
                            <Label htmlFor="codigo_postal">Código Postal</Label>
                            <Input
                              id="codigo_postal"
                              value={formData.codigo_postal}
                              onChange={(e) => handleInputChange("codigo_postal", e.target.value)}
                              placeholder="5 dígitos"
                              maxLength={5}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Contacto de Emergencia</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="contacto_emergencia_nombre">Nombre</Label>
                            <Input
                              id="contacto_emergencia_nombre"
                              value={formData.contacto_emergencia_nombre}
                              onChange={(e) => handleInputChange("contacto_emergencia_nombre", e.target.value)}
                              placeholder="Nombre del contacto"
                            />
                          </div>
                          <div>
                            <Label htmlFor="contacto_emergencia_telefono">Teléfono</Label>
                            <Input
                              id="contacto_emergencia_telefono"
                              value={formData.contacto_emergencia_telefono}
                              onChange={(e) => handleInputChange("contacto_emergencia_telefono", e.target.value)}
                              placeholder="Teléfono de emergencia"
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <Label htmlFor="contacto_emergencia_relacion">Relación</Label>
                            <Select value={formData.contacto_emergencia_relacion} onValueChange={(value) => handleInputChange("contacto_emergencia_relacion", value)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Relación" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Abuela">Abuela</SelectItem>
                                <SelectItem value="Abuelo">Abuelo</SelectItem>
                                <SelectItem value="Tía">Tía</SelectItem>
                                <SelectItem value="Tío">Tío</SelectItem>
                                <SelectItem value="Hermana">Hermana</SelectItem>
                                <SelectItem value="Hermano">Hermano</SelectItem>
                                <SelectItem value="Otros">Otros</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="facturacion" className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-slate-900">Datos Fiscales</h3>
                          <Button 
                            type="button" 
                            onClick={addFiscalData}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar RFC
                          </Button>
                        </div>
                        
                        <div className="space-y-6">
                          {datosFiscales.map((datoFiscal, index) => (
                            <div key={datoFiscal.id} className="border rounded-lg p-4 bg-gray-50">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center space-x-2">
                                  <h4 className="font-medium text-slate-900">
                                    RFC #{index + 1}
                                  </h4>
                                  {datoFiscal.es_principal && (
                                    <Badge variant="default" className="bg-green-100 text-green-800">
                                      Principal
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center space-x-2">
                                  {!datoFiscal.es_principal && (
                                    <Button 
                                      type="button" 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => setPrincipalFiscalData(index)}
                                    >
                                      Hacer Principal
                                    </Button>
                                  )}
                                  {datosFiscales.length > 1 && (
                                    <Button 
                                      type="button" 
                                      variant="outline" 
                                      size="sm"
                                      onClick={() => removeFiscalData(index)}
                                      className="text-red-600 hover:text-red-700"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <Label htmlFor={`razon_social_${index}`}>Razón Social</Label>
                                  <Input
                                    id={`razon_social_${index}`}
                                    value={datoFiscal.razon_social}
                                    onChange={(e) => handleFiscalDataChange(index, "razon_social", e.target.value)}
                                    placeholder="Nombre o razón social para facturación"
                                  />
                                </div>
                                <div>
                                  <Label htmlFor={`rfc_${index}`}>RFC</Label>
                                  <Input
                                    id={`rfc_${index}`}
                                    value={datoFiscal.rfc}
                                    onChange={(e) => handleFiscalDataChange(index, "rfc", e.target.value.toUpperCase())}
                                    placeholder="RFC de 12 o 13 caracteres"
                                    maxLength={13}
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <Label htmlFor={`email_facturacion_${index}`}>Email para Facturación</Label>
                                  <Input
                                    id={`email_facturacion_${index}`}
                                    type="email"
                                    value={datoFiscal.email_facturacion}
                                    onChange={(e) => handleFiscalDataChange(index, "email_facturacion", e.target.value)}
                                    placeholder="Email donde se enviarán las facturas"
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <Label htmlFor={`direccion_fiscal_${index}`}>Dirección Fiscal</Label>
                                  <Input
                                    id={`direccion_fiscal_${index}`}
                                    value={datoFiscal.direccion_fiscal}
                                    onChange={(e) => handleFiscalDataChange(index, "direccion_fiscal", e.target.value)}
                                    placeholder="Dirección fiscal registrada en el SAT"
                                  />
                                </div>
                              </div>
                              
                              <div className="mt-4 pt-4 border-t">
                                <h5 className="font-medium text-slate-900 mb-3">Configuración CFDI</h5>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <Label htmlFor={`uso_cfdi_${index}`}>Uso de CFDI</Label>
                                    <Select 
                                      value={datoFiscal.uso_cfdi} 
                                      onValueChange={(value) => handleFiscalDataChange(index, "uso_cfdi", value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="G01">G01 - Adquisición de mercancías</SelectItem>
                                        <SelectItem value="G03">G03 - Gastos en general</SelectItem>
                                        <SelectItem value="P01">P01 - Por definir</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label htmlFor={`metodo_pago_${index}`}>Método de Pago</Label>
                                    <Select 
                                      value={datoFiscal.metodo_pago} 
                                      onValueChange={(value) => handleFiscalDataChange(index, "metodo_pago", value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="PUE">PUE - Pago en una sola exhibición</SelectItem>
                                        <SelectItem value="PPD">PPD - Pago en parcialidades o diferido</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label htmlFor={`forma_pago_${index}`}>Forma de Pago</Label>
                                    <Select 
                                      value={datoFiscal.forma_pago} 
                                      onValueChange={(value) => handleFiscalDataChange(index, "forma_pago", value)}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="01">01 - Efectivo</SelectItem>
                                        <SelectItem value="02">02 - Cheque nominativo</SelectItem>
                                        <SelectItem value="03">03 - Transferencia electrónica</SelectItem>
                                        <SelectItem value="04">04 - Tarjeta de crédito</SelectItem>
                                        <SelectItem value="28">28 - Tarjeta de débito</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="adicional" className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Contacto de Emergencia</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="contacto_emergencia_nombre">Nombre Completo</Label>
                            <Input
                              id="contacto_emergencia_nombre"
                              value={formData.contacto_emergencia_nombre}
                              onChange={(e) => handleInputChange("contacto_emergencia_nombre", e.target.value)}
                              placeholder="Nombre del contacto de emergencia"
                            />
                          </div>
                          <div>
                            <Label htmlFor="contacto_emergencia_telefono">Teléfono</Label>
                            <Input
                              id="contacto_emergencia_telefono"
                              value={formData.contacto_emergencia_telefono}
                              onChange={(e) => handleInputChange("contacto_emergencia_telefono", e.target.value)}
                              placeholder="Teléfono de emergencia"
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <Label htmlFor="contacto_emergencia_relacion">Relación</Label>
                            <Select value={formData.contacto_emergencia_relacion} onValueChange={(value) => handleInputChange("contacto_emergencia_relacion", value)}>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar relación" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="abuelo">Abuelo/a</SelectItem>
                                <SelectItem value="tio">Tío/a</SelectItem>
                                <SelectItem value="hermano">Hermano/a</SelectItem>
                                <SelectItem value="amigo">Amigo/a de familia</SelectItem>
                                <SelectItem value="vecino">Vecino/a</SelectItem>
                                <SelectItem value="otro">Otro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="observaciones">Observaciones</Label>
                        <Textarea
                          id="observaciones"
                          value={formData.observaciones}
                          onChange={(e) => handleInputChange("observaciones", e.target.value)}
                          placeholder="Información adicional sobre la familia..."
                          rows={4}
                        />
                      </div>
                      
                      <div>
                        <Label htmlFor="estatus">Estado de la Familia</Label>
                        <Select value={formData.estatus} onValueChange={(value) => handleInputChange("estatus", value)}>
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="activo">Activo</SelectItem>
                            <SelectItem value="inactivo">Inactivo</SelectItem>
                            <SelectItem value="suspendido">Suspendido</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>

                    <TabsContent value="credenciales" className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Credenciales del Portal</h3>
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="usuario">Usuario *</Label>
                              <Input
                                id="usuario"
                                value={formData.usuario}
                                onChange={(e) => handleInputChange("usuario", e.target.value)}
                                placeholder="Nombre de usuario para el portal"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="password">Contraseña *</Label>
                              <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => handleInputChange("password", e.target.value)}
                                placeholder="Contraseña para el portal"
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="id_referencia_padre">ID de Refereence - Padre</Label>
                              <Input
                                id="id_referencia_padre"
                                value={formData.id_referencia_padre}
                                onChange={(e) => handleInputChange("id_referencia_padre", e.target.value)}
                                placeholder="ID único de refereence del padre"
                              />
                            </div>
                            <div>
                              <Label htmlFor="id_referencia_madre">ID de Refereence - Madre</Label>
                              <Input
                                id="id_referencia_madre"
                                value={formData.id_referencia_madre}
                                onChange={(e) => handleInputChange("id_referencia_madre", e.target.value)}
                                placeholder="ID único de refereence de la madre"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <div className="flex justify-end gap-2 mt-6">
                      <Button variant="outline" onClick={() => setShowAddModal(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">
                        {editingFamily ? 'Actualizar familia' : 'Agregar familia'}
                      </Button>
                    </div>
                  </Tabs>
                </form>
              </TabsContent>

              <TabsContent value="excel" className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-5 h-5 text-blue-600" />
                    <h3 className="font-semibold text-blue-900">Importación masiva de familias</h3>
                  </div>
                  <p className="text-sm text-blue-700">
                    Importa múltiples familias desde un archivo Excel (.csv). Descarga la plantilla, completa los datos y súbela para procesamiento automático.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Button onClick={downloadFamilyTemplate} variant="outline" className="w-full">
                      <Download className="w-4 h-4 mr-2" />
                      Descargar plantilla Excel
                    </Button>
                  </div>
                  <div>
                    <Label htmlFor="family-file-input">Seleccionar archivo Excel</Label>
                    <Input
                      id="family-file-input"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      ref={fileInputRef}
                    />
                  </div>
                </div>

                {importFile && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-900">Archivo seleccionado: {importFile.name}</span>
                    </div>
                    <p className="text-sm text-green-700">
                      Archivo listo para importar. Presiona "Importar familias" para comenzar.
                    </p>
                  </div>
                )}

                {isImporting && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Importando familias...</span>
                      <span className="text-sm font-medium text-slate-900">{importProgress}%</span>
                    </div>
                    <Progress value={importProgress} className="w-full" />
                  </div>
                )}

                <div className="bg-amber-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-amber-900 mb-2">Formato de la plantilla:</h4>
                  <p className="text-sm text-amber-700 mb-2">
                    La plantilla incluye <strong>33 campos obligatorios</strong> con nombres separados para padre y madre:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-amber-700">
                    <div>
                      <p><strong>Información de la familia:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• apellido_paterno</li>
                        <li>• apellido_materno</li>
                      </ul>
                    </div>
                    <div>
                      <p><strong>Datos del padre:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• padre_nombres</li>
                        <li>• padre_primer_apellido</li>
                        <li>• padre_segundo_apellido</li>
                        <li>• padre_telefono</li>
                        <li>• padre_email</li>
                        <li>• padre_ocupacion</li>
                        <li>• padre_empresa</li>
                      </ul>
                    </div>
                    <div>
                      <p><strong>Datos de la madre:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• madre_nombres</li>
                        <li>• madre_primer_apellido</li>
                        <li>• madre_segundo_apellido</li>
                        <li>• madre_telefono</li>
                        <li>• madre_email</li>
                        <li>• madre_ocupacion</li>
                        <li>• madre_empresa</li>
                      </ul>
                    </div>
                    <div>
                      <p><strong>Otros datos:</strong></p>
                      <ul className="ml-4 space-y-1">
                        <li>• direccion, colonia, ciudad, estado, codigo_postal</li>
                        <li>• razon_social, rfc, email_facturacion</li>
                        <li>• contacto_emergencia (nombre, telefono, relacion)</li>
                        <li>• observaciones, estatus</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={processExcelImport} disabled={!importFile || isImporting}>
                    {isImporting ? 'Importando...' : 'Importar familias'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <form onSubmit={handleSubmit}>
              <Tabs defaultValue="generales" className="space-y-4">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="generales">Datos Generales</TabsTrigger>
                  <TabsTrigger value="contacto">Contacto y Dirección</TabsTrigger>
                  <TabsTrigger value="facturacion">Facturación</TabsTrigger>
                  <TabsTrigger value="adicional">Información Adicional</TabsTrigger>
                  <TabsTrigger value="credenciales">Credenciales del Portal</TabsTrigger>
                </TabsList>

              <TabsContent value="generales" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Padre/Tutor Principal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="padre_nombre">Nombre Completo *</Label>
                      <Input
                        id="padre_nombre"
                        value={combineNames(formData.padre_nombres, formData.padre_primer_apellido, formData.padre_segundo_apellido)}
                        onChange={(e) => {
                          const nombreParts = e.target.value.split(' ');
                          const nombres = nombreParts[0] || '';
                          const primerApellido = nombreParts[1] || '';
                          const segundoApellido = nombreParts.slice(2).join(' ') || '';
                          setFormData(prev => ({
                            ...prev,
                            padre_nombres: nombres,
                            padre_primer_apellido: primerApellido,
                            padre_segundo_apellido: segundoApellido
                          }));
                        }}
                        placeholder="Nombre completo del padre/tutor"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_telefono">Teléfono *</Label>
                      <Input
                        id="padre_telefono"
                        value={formData.padre_telefono}
                        onChange={(e) => handleInputChange("padre_telefono", e.target.value)}
                        placeholder="Teléfono principal"
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_email">Correo Electrónico</Label>
                      <Input
                        id="padre_email"
                        type="email"
                        value={formData.padre_email}
                        onChange={(e) => handleInputChange("padre_email", e.target.value)}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="padre_ocupacion">Ocupación</Label>
                      <Input
                        id="padre_ocupacion"
                        value={formData.padre_ocupacion}
                        onChange={(e) => handleInputChange("padre_ocupacion", e.target.value)}
                        placeholder="Ocupación o profesión"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="padre_empresa">Empresa/Lugar de trabajo</Label>
                      <Input
                        id="padre_empresa"
                        value={formData.padre_empresa}
                        onChange={(e) => handleInputChange("padre_empresa", e.target.value)}
                        placeholder="Nombre de la empresa o lugar de trabajo"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Madre/Tutora</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="madre_nombre">Nombre Completo</Label>
                      <Input
                        id="madre_nombre"
                        value={combineNames(formData.madre_nombres, formData.madre_primer_apellido, formData.madre_segundo_apellido)}
                        onChange={(e) => {
                          const nombreParts = e.target.value.split(' ');
                          const nombres = nombreParts[0] || '';
                          const primerApellido = nombreParts[1] || '';
                          const segundoApellido = nombreParts.slice(2).join(' ') || '';
                          setFormData(prev => ({
                            ...prev,
                            madre_nombres: nombres,
                            madre_primer_apellido: primerApellido,
                            madre_segundo_apellido: segundoApellido
                          }));
                        }}
                        placeholder="Nombre completo de la madre/tutora"
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_telefono">Teléfono</Label>
                      <Input
                        id="madre_telefono"
                        value={formData.madre_telefono}
                        onChange={(e) => handleInputChange("madre_telefono", e.target.value)}
                        placeholder="Teléfono de la madre"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_email">Correo Electrónico</Label>
                      <Input
                        id="madre_email"
                        type="email"
                        value={formData.madre_email}
                        onChange={(e) => handleInputChange("madre_email", e.target.value)}
                        placeholder="correo@ejemplo.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="madre_ocupacion">Ocupación</Label>
                      <Input
                        id="madre_ocupacion"
                        value={formData.madre_ocupacion}
                        onChange={(e) => handleInputChange("madre_ocupacion", e.target.value)}
                        placeholder="Ocupación o profesión"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="madre_empresa">Empresa/Lugar de trabajo</Label>
                      <Input
                        id="madre_empresa"
                        value={formData.madre_empresa}
                        onChange={(e) => handleInputChange("madre_empresa", e.target.value)}
                        placeholder="Nombre de la empresa o lugar de trabajo"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contacto" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Dirección</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <Label htmlFor="direccion">Dirección Completa</Label>
                      <Input
                        id="direccion"
                        value={formData.direccion}
                        onChange={(e) => handleInputChange("direccion", e.target.value)}
                        placeholder="Calle, número, colonia"
                      />
                    </div>
                    <div>
                      <Label htmlFor="ciudad">Ciudad</Label>
                      <Input
                        id="ciudad"
                        value={formData.ciudad}
                        onChange={(e) => handleInputChange("ciudad", e.target.value)}
                        placeholder="Ciudad"
                      />
                    </div>
                    <div>
                      <Label htmlFor="codigo_postal">Código Postal</Label>
                      <Input
                        id="codigo_postal"
                        value={formData.codigo_postal}
                        onChange={(e) => handleInputChange("codigo_postal", e.target.value)}
                        placeholder="5 dígitos"
                        maxLength={5}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Contacto de Emergencia</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="contacto_emergencia_nombre">Nombre</Label>
                      <Input
                        id="contacto_emergencia_nombre"
                        value={formData.contacto_emergencia_nombre}
                        onChange={(e) => handleInputChange("contacto_emergencia_nombre", e.target.value)}
                        placeholder="Nombre del contacto"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_telefono">Teléfono</Label>
                      <Input
                        id="contacto_emergencia_telefono"
                        value={formData.contacto_emergencia_telefono}
                        onChange={(e) => handleInputChange("contacto_emergencia_telefono", e.target.value)}
                        placeholder="Teléfono de emergencia"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_relacion">Relación</Label>
                      <Select value={formData.contacto_emergencia_relacion} onValueChange={(value) => handleInputChange("contacto_emergencia_relacion", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar relación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="abuelo">Abuelo/a</SelectItem>
                          <SelectItem value="tio">Tío/a</SelectItem>
                          <SelectItem value="hermano">Hermano/a</SelectItem>
                          <SelectItem value="amigo">Amigo/a de la familia</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="facturacion" className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900">Datos Fiscales</h3>
                    <Button 
                      type="button" 
                      onClick={addFiscalData}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Agregar RFC
                    </Button>
                  </div>
                  
                  <div className="space-y-6">
                    {datosFiscales.map((datoFiscal, index) => (
                      <div key={datoFiscal.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-slate-900">
                              RFC #{index + 1}
                            </h4>
                            {datoFiscal.es_principal && (
                              <Badge variant="default" className="bg-green-100 text-green-800">
                                Principal
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            {!datoFiscal.es_principal && (
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm"
                                onClick={() => setPrincipalFiscalData(index)}
                              >
                                Hacer Principal
                              </Button>
                            )}
                            {datosFiscales.length > 1 && (
                              <Button 
                                type="button" 
                                variant="outline" 
                                size="sm"
                                onClick={() => removeFiscalData(index)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`razon_social_${index}`}>Razón Social</Label>
                            <Input
                              id={`razon_social_${index}`}
                              value={datoFiscal.razon_social}
                              onChange={(e) => handleFiscalDataChange(index, "razon_social", e.target.value)}
                              placeholder="Nombre o razón social para facturación"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`rfc_${index}`}>RFC</Label>
                            <Input
                              id={`rfc_${index}`}
                              value={datoFiscal.rfc}
                              onChange={(e) => handleFiscalDataChange(index, "rfc", e.target.value.toUpperCase())}
                              placeholder="RFC de 12 o 13 caracteres"
                              maxLength={13}
                            />
                          </div>
                          <div>
                            <Label htmlFor={`email_facturacion_${index}`}>Email para Facturación</Label>
                            <Input
                              id={`email_facturacion_${index}`}
                              type="email"
                              value={datoFiscal.email_facturacion}
                              onChange={(e) => handleFiscalDataChange(index, "email_facturacion", e.target.value)}
                              placeholder="Email donde se enviarán las facturas"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`direccion_fiscal_${index}`}>Dirección Fiscal</Label>
                            <Input
                              id={`direccion_fiscal_${index}`}
                              value={datoFiscal.direccion_fiscal}
                              onChange={(e) => handleFiscalDataChange(index, "direccion_fiscal", e.target.value)}
                              placeholder="Dirección fiscal registrada en el SAT"
                            />
                          </div>
                        </div>

                        <div className="mt-4">
                          <h5 className="font-medium text-slate-900 mb-3">Configuración CFDI</h5>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <Label htmlFor={`uso_cfdi_${index}`}>Uso de CFDI</Label>
                              <Select value={datoFiscal.uso_cfdi} onValueChange={(value) => handleFiscalDataChange(index, "uso_cfdi", value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar uso" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="G01">G01 - Adquisición de mercancías</SelectItem>
                                  <SelectItem value="G03">G03 - Gastos en general</SelectItem>
                                  <SelectItem value="P01">P01 - Por definir</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`metodo_pago_${index}`}>Método de Pago</Label>
                              <Select value={datoFiscal.metodo_pago} onValueChange={(value) => handleFiscalDataChange(index, "metodo_pago", value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar método" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="PUE">PUE - Pago en una exhibición</SelectItem>
                                  <SelectItem value="PPD">PPD - Pago en parcialidades</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor={`forma_pago_${index}`}>Forma de Pago</Label>
                              <Select value={datoFiscal.forma_pago} onValueChange={(value) => handleFiscalDataChange(index, "forma_pago", value)}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar forma" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="01">01 - Efectivo</SelectItem>
                                  <SelectItem value="03">03 - Transferencia electrónica</SelectItem>
                                  <SelectItem value="04">04 - Tarjeta de crédito</SelectItem>
                                  <SelectItem value="28">28 - Tarjeta de débito</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="adicional" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Contacto de Emergencia</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="contacto_emergencia_nombre">Nombre Completo</Label>
                      <Input
                        id="contacto_emergencia_nombre"
                        value={formData.contacto_emergencia_nombre}
                        onChange={(e) => handleInputChange("contacto_emergencia_nombre", e.target.value)}
                        placeholder="Nombre del contacto de emergencia"
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_telefono">Teléfono</Label>
                      <Input
                        id="contacto_emergencia_telefono"
                        value={formData.contacto_emergencia_telefono}
                        onChange={(e) => handleInputChange("contacto_emergencia_telefono", e.target.value)}
                        placeholder="Teléfono de emergencia"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <Label htmlFor="contacto_emergencia_relacion">Relación</Label>
                      <Select value={formData.contacto_emergencia_relacion} onValueChange={(value) => handleInputChange("contacto_emergencia_relacion", value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar relación" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="abuelo">Abuelo/a</SelectItem>
                          <SelectItem value="tio">Tío/a</SelectItem>
                          <SelectItem value="hermano">Hermano/a</SelectItem>
                          <SelectItem value="amigo">Amigo/a de la familia</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Observaciones</h3>
                  <div>
                    <Label htmlFor="observaciones">Información adicional sobre la familia</Label>
                    <Textarea
                      id="observaciones"
                      value={formData.observaciones}
                      onChange={(e) => handleInputChange("observaciones", e.target.value)}
                      placeholder="Información adicional sobre la familia..."
                      className="min-h-[100px]"
                    />
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Estado de la Familia</h3>
                  <div>
                    <Label htmlFor="estatus">Estado</Label>
                    <Select value={formData.estatus} onValueChange={(value) => handleInputChange("estatus", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">Activo</SelectItem>
                        <SelectItem value="inactivo">Inactivo</SelectItem>
                        <SelectItem value="suspendido">Suspendido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="credenciales" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Credenciales del Portal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="usuario">Usuario *</Label>
                      <Input
                        id="usuario"
                        value={formData.usuario}
                        onChange={(e) => handleInputChange("usuario", e.target.value)}
                        placeholder="Nombre de usuario para el portal"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="password">Contraseña *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleInputChange("password", e.target.value)}
                        placeholder="Contraseña para el portal"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="id_referencia_padre">ID de Refereence - Padre</Label>
                      <Input
                        id="id_referencia_padre"
                        value={formData.id_referencia_padre}
                        onChange={(e) => handleInputChange("id_referencia_padre", e.target.value)}
                        placeholder="ID único de refereence del padre"
                      />
                    </div>
                    <div>
                      <Label htmlFor="id_referencia_madre">ID de Refereence - Madre</Label>
                      <Input
                        id="id_referencia_madre"
                        value={formData.id_referencia_madre}
                        onChange={(e) => handleInputChange("id_referencia_madre", e.target.value)}
                        placeholder="ID único de refereence de la madre"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <div className="flex justify-end space-x-4 pt-6 border-t mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  resetForm();
                  setShowAddModal(false);
                  setShowEditModal(false);
                  setEditingFamily(null);
                }}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                  {editingFamily ? (
                    <>
                      <Edit className="w-4 h-4 mr-2" />
                      Actualizar Familia
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Registrar Familia
                    </>
                  )}
                </Button>
              </div>
            </Tabs>
          </form>
        )}
        </DialogContent>
      </Dialog>

      {/* Modal para vincular estudiantes */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular Estudiantes a la Familia</DialogTitle>
          </DialogHeader>
          
          {selectedFamily && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg">
                <h3 className="font-medium">{selectedFamily.numero_familia} - Familia {selectedFamily.apellido_paterno}</h3>
                <p className="text-sm text-slate-600">Responsable: {selectedFamily.padre_nombre}</p>
              </div>

              <div>
                <h4 className="font-medium mb-3">Estudiantes disponibles</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {estudiantesDisponibles.map((estudiante) => (
                    <div key={estudiante.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{estudiante.nombre_completo}</div>
                        <div className="text-sm text-slate-600">{estudiante.grado} {estudiante.grupo}</div>
                      </div>
                      <Button size="sm" variant="outline">
                        <Link2 className="w-4 h-4 mr-1" />
                        Vincular
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowLinkModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para visualización de información familiar */}
      <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Información Familiar</DialogTitle>
          </DialogHeader>
          
          {viewingFamily && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Información General */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                    <Home className="w-5 h-5 mr-2" />
                    Información General
                  </h3>
                  <div className="space-y-2">
                    <p><strong>Número de Familia:</strong> {viewingFamily.numero_familia}</p>
                    <p><strong>Fecha de Registro:</strong> {viewingFamily.fecha_registro}</p>
                    <p><strong>Estado:</strong> 
                      <Badge variant={viewingFamily.estatus === 'activo' ? 'default' : 'secondary'} className="ml-2">
                        {viewingFamily.estatus}
                      </Badge>
                    </p>
                    <p><strong>Saldo Total:</strong> ${(viewingFamily.saldo_total / 100).toLocaleString()}</p>
                  </div>
                </div>

                {/* Datos del Padre/Tutor */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-3 flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Padre/Tutor Principal
                  </h3>
                  <div className="space-y-2">
                    <p><strong>Nombre:</strong> {viewingFamily.padre_nombre}</p>
                    <p><strong>Teléfono:</strong> {viewingFamily.padre_telefono}</p>
                    <p><strong>Email:</strong> {viewingFamily.padre_email}</p>
                    <p><strong>Ocupación:</strong> {viewingFamily.padre_ocupacion || 'No especificado'}</p>
                    <p><strong>Empresa:</strong> {viewingFamily.padre_empresa || 'No especificado'}</p>
                  </div>
                </div>

                {/* Datos de la Madre/Tutora */}
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
                    <Users className="w-5 h-5 mr-2" />
                    Madre/Tutora
                  </h3>
                  <div className="space-y-2">
                    <p><strong>Nombre:</strong> {viewingFamily.madre_nombre}</p>
                    <p><strong>Teléfono:</strong> {viewingFamily.madre_telefono}</p>
                    <p><strong>Email:</strong> {viewingFamily.madre_email}</p>
                    <p><strong>Ocupación:</strong> {viewingFamily.madre_ocupacion || 'No especificado'}</p>
                    <p><strong>Empresa:</strong> {viewingFamily.madre_empresa || 'No especificado'}</p>
                  </div>
                </div>

                {/* Información de Dirección */}
                <div className="bg-orange-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-orange-900 mb-3 flex items-center">
                    <MapPin className="w-5 h-5 mr-2" />
                    Dirección
                  </h3>
                  <div className="space-y-2">
                    <p><strong>Dirección:</strong> {viewingFamily.direccion}</p>
                    <p><strong>Colonia:</strong> {viewingFamily.colonia}</p>
                    <p><strong>Ciudad:</strong> {viewingFamily.ciudad}</p>
                    <p><strong>Estado:</strong> {viewingFamily.estado}</p>
                    <p><strong>Código Postal:</strong> {viewingFamily.codigo_postal}</p>
                  </div>
                </div>
              </div>

              {/* Datos Fiscales */}
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-900 mb-3 flex items-center">
                  <CreditCard className="w-5 h-5 mr-2" />
                  Datos Fiscales
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p><strong>Razón Social:</strong> {viewingFamily.razon_social}</p>
                    <p><strong>RFC:</strong> {viewingFamily.rfc}</p>
                    <p><strong>Email de Facturación:</strong> {viewingFamily.email_facturacion}</p>
                  </div>
                  <div className="space-y-2">
                    <p><strong>Uso CFDI:</strong> {viewingFamily.uso_cfdi}</p>
                    <p><strong>Método de Pago:</strong> {viewingFamily.metodo_pago}</p>
                    <p><strong>Forma de Pago:</strong> {viewingFamily.forma_pago}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <p><strong>Dirección Fiscal:</strong> {viewingFamily.direccion_fiscal}</p>
                </div>
              </div>

              {/* Estudiantes Vinculados */}
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h3 className="font-semibold text-indigo-900 mb-3 flex items-center">
                  <Users className="w-5 h-5 mr-2" />
                  Estudiantes Vinculados
                </h3>
                <div className="space-y-2">
                  {viewingFamily.estudiantes_vinculados && viewingFamily.estudiantes_vinculados.length > 0 ? (
                    viewingFamily.estudiantes_vinculados.map((estudiante: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div>
                          <p className="font-medium">{estudiante.nombre}</p>
                          <p className="text-sm text-slate-600">{estudiante.grado}</p>
                        </div>
                        <Badge variant="outline">{estudiante.grado}</Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-500">No hay estudiantes vinculados a esta familia</p>
                  )}
                </div>
              </div>

              {/* Información Adicional */}
              <div className="bg-slate-50 p-4 rounded-lg">
                <h3 className="font-semibold text-slate-900 mb-3 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  Información Adicional
                </h3>
                <div className="space-y-2">
                  <p><strong>Contacto de Emergencia:</strong> {viewingFamily.contacto_emergencia_nombre || 'No especificado'}</p>
                  <p><strong>Teléfono de Emergencia:</strong> {viewingFamily.contacto_emergencia_telefono || 'No especificado'}</p>
                  <p><strong>Relación:</strong> {viewingFamily.contacto_emergencia_relacion || 'No especificado'}</p>
                  <p><strong>Observaciones:</strong> {viewingFamily.observaciones || 'Sin observaciones'}</p>
                </div>
              </div>

              {/* Credenciales del Portal */}
              <div className="bg-teal-50 p-4 rounded-lg">
                <h3 className="font-semibold text-teal-900 mb-3 flex items-center">
                  <UserCheck className="w-5 h-5 mr-2" />
                  Credenciales del Portal
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p><strong>Usuario:</strong> {viewingFamily.usuario || 'No especificado'}</p>
                    <p><strong>Contraseña:</strong> {viewingFamily.password ? '••••••••' : 'No especificado'}</p>
                  </div>
                  <div className="space-y-2">
                    <p><strong>ID de Refereence (Padre):</strong> {viewingFamily.id_referencia_padre || 'No especificado'}</p>
                    <p><strong>ID de Refereence (Madre):</strong> {viewingFamily.id_referencia_madre || 'No especificado'}</p>
                  </div>
                </div>
              </div>

              {/* Botón de Editar */}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowViewModal(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => {
                  setShowViewModal(false);
                  loadFamilyForEdit(viewingFamily);
                }}>
                  Editar Información
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}