import { useState, useRef } from "react";
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
import { Home, Plus, Search, Edit, Trash2, Phone, Mail, MapPin, Users, CreditCard, FileText, Link2, Download, Upload, AlertCircle } from "lucide-react";

export default function Familias() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState<any>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingFamily, setEditingFamily] = useState<any>(null);
  
  // Estados para importación Excel
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    // Datos Generales
    numero_familia: "",
    apellido_paterno: "",
    apellido_materno: "",
    // Padre/Tutor Principal
    padre_nombre: "",
    padre_telefono: "",
    padre_email: "",
    padre_ocupacion: "",
    padre_empresa: "",
    // Madre/Tutora
    madre_nombre: "",
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
    // Datos de Facturación
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
    estatus: "activo"
  });

  const [familias, setFamilias] = useState([
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
  ]);

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

  const resetForm = () => {
    setFormData({
      numero_familia: "",
      padre_nombre: "",
      padre_telefono: "",
      padre_email: "",
      padre_ocupacion: "",
      padre_empresa: "",
      madre_nombre: "",
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
      estatus: "activo"
    });
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
    setFormData({
      numero_familia: familia.numero_familia,
      padre_nombre: familia.padre_nombre,
      padre_telefono: familia.padre_telefono,
      padre_email: familia.padre_email || "",
      padre_ocupacion: familia.padre_ocupacion || "",
      padre_empresa: familia.padre_empresa || "",
      madre_nombre: familia.madre_nombre || "",
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
      estatus: familia.estatus || "activo"
    });
    setEditingFamily(familia);
    setShowEditModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.padre_nombre || !formData.padre_telefono) {
      toast({
        title: "Error",
        description: "Por favor complete los campos obligatorios: nombre del padre y teléfono.",
        variant: "destructive"
      });
      return;
    }

    // Validar RFC si se proporciona
    if (formData.rfc && formData.rfc.length < 12) {
      toast({
        title: "Error",
        description: "El RFC debe tener al menos 12 caracteres.",
        variant: "destructive"
      });
      return;
    }

    if (editingFamily) {
      // Actualizar familia existente
      const updatedFamily = {
        ...editingFamily,
        padre_nombre: formData.padre_nombre,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: formData.madre_nombre,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || formData.padre_nombre,
        rfc: formData.rfc,
        estatus: formData.estatus
      };

      setFamilias(prev => prev.map(f => f.id === editingFamily.id ? updatedFamily : f));
      
      toast({
        title: "Familia actualizada",
        description: `Los datos de la familia ${formData.apellido_paterno} han sido actualizados exitosamente.`
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
        apellido_paterno: formData.apellido_paterno,
        apellido_materno: formData.apellido_materno,
        padre_nombre: formData.padre_nombre,
        padre_telefono: formData.padre_telefono,
        padre_email: formData.padre_email,
        madre_nombre: formData.madre_nombre,
        madre_telefono: formData.madre_telefono,
        madre_email: formData.madre_email,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        codigo_postal: formData.codigo_postal,
        razon_social: formData.razon_social || formData.padre_nombre,
        rfc: formData.rfc,
        estatus: formData.estatus,
        estudiantes_vinculados: [],
        saldo_total: 0,
        fecha_registro: new Date().toISOString().split('T')[0]
      };

      setFamilias(prev => [...prev, newFamily]);
      
      toast({
        title: "Familia registrada",
        description: `La familia ${formData.apellido_paterno} ha sido registrada exitosamente con número ${numeroFamilia}.`
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

  // Filtrar familias según criterios de búsqueda
  const filteredFamilias = familias.filter(familia => {
    const searchLower = searchTerm.toLowerCase();
    return familia.numero_familia.toLowerCase().includes(searchLower) ||
           familia.apellido_paterno.toLowerCase().includes(searchLower) ||
           familia.apellido_materno.toLowerCase().includes(searchLower) ||
           familia.padre_nombre.toLowerCase().includes(searchLower) ||
           familia.madre_nombre.toLowerCase().includes(searchLower) ||
           familia.padre_email.toLowerCase().includes(searchLower) ||
           familia.rfc.toLowerCase().includes(searchLower);
  });

  const estadisticas = {
    total: familias.length,
    activas: familias.filter(f => f.estatus === "activo").length,
    saldoTotal: familias.reduce((sum, f) => sum + f.saldo_total, 0),
    promedioHijos: familias.reduce((sum, f) => sum + f.estudiantes_vinculados.length, 0) / familias.length
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestión de Familias</h1>
          <p className="text-slate-600">Administra datos de padres, tutores y información de facturación</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Agregar Familia
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="p-4 text-center">
            <Home className="w-8 h-8 text-blue-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.total}</div>
            <div className="text-sm text-slate-600">Total familias</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="w-8 h-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">{estadisticas.activas}</div>
            <div className="text-sm text-slate-600">Familias activas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CreditCard className="w-8 h-8 text-orange-600 mx-auto mb-2" />
            <div className="text-2xl font-bold">${(estadisticas.saldoTotal / 100).toLocaleString()}</div>
            <div className="text-sm text-slate-600">Saldo total pendiente</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{estadisticas.promedioHijos.toFixed(1)}</div>
            <div className="text-sm text-slate-600">Promedio hijos por familia</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Búsqueda de familias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="search">Buscar familia</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder="Número, apellidos, nombre, email o RFC..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => setSearchTerm("")}>
                Limpiar búsqueda
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de familias */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de familias ({filteredFamilias.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredFamilias.map((familia) => (
              <div key={familia.id} className="border rounded-lg p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                      <Home className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{familia.numero_familia}</h3>
                        <Badge variant={familia.estatus === 'activo' ? 'default' : 'secondary'}>
                          {familia.estatus}
                        </Badge>
                      </div>
                      <h4 className="font-medium text-slate-900 mb-2">
                        Familia {familia.apellido_paterno} {familia.apellido_materno}
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
                              {familia.estudiantes_vinculados.map((estudiante, index) => (
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
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedFamily(familia);
                        setShowLinkModal(true);
                      }} title="Vincular estudiantes">
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => loadFamilyForEdit(familia)} title="Editar familia">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(familia.id)} title="Eliminar familia"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
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
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="generales">Datos Generales</TabsTrigger>
                      <TabsTrigger value="contacto">Contacto y Dirección</TabsTrigger>
                      <TabsTrigger value="facturacion">Facturación</TabsTrigger>
                      <TabsTrigger value="adicional">Información Adicional</TabsTrigger>
                    </TabsList>

                    <TabsContent value="generales" className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Padre/Tutor Principal</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="padre_nombre">Nombre Completo *</Label>
                            <Input
                              id="padre_nombre"
                              value={formData.padre_nombre}
                              onChange={(e) => handleInputChange("padre_nombre", e.target.value)}
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
                          <div>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="madre_nombre">Nombre Completo</Label>
                            <Input
                              id="madre_nombre"
                              value={formData.madre_nombre}
                              onChange={(e) => handleInputChange("madre_nombre", e.target.value)}
                              placeholder="Nombre completo de la madre/tutora"
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
                          <div>
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
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Datos Fiscales</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="razon_social">Razón Social</Label>
                            <Input
                              id="razon_social"
                              value={formData.razon_social}
                              onChange={(e) => handleInputChange("razon_social", e.target.value)}
                              placeholder="Nombre o razón social para facturación"
                            />
                          </div>
                          <div>
                            <Label htmlFor="rfc">RFC</Label>
                            <Input
                              id="rfc"
                              value={formData.rfc}
                              onChange={(e) => handleInputChange("rfc", e.target.value.toUpperCase())}
                              placeholder="RFC de 12 o 13 caracteres"
                              maxLength={13}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="email_facturacion">Email para Facturación</Label>
                            <Input
                              id="email_facturacion"
                              type="email"
                              value={formData.email_facturacion}
                              onChange={(e) => handleInputChange("email_facturacion", e.target.value)}
                              placeholder="Email donde se enviarán las facturas"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="direccion_fiscal">Dirección Fiscal</Label>
                            <Input
                              id="direccion_fiscal"
                              value={formData.direccion_fiscal}
                              onChange={(e) => handleInputChange("direccion_fiscal", e.target.value)}
                              placeholder="Dirección fiscal registrada en el SAT"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-4">Configuración CFDI</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <Label htmlFor="uso_cfdi">Uso de CFDI</Label>
                            <Select value={formData.uso_cfdi} onValueChange={(value) => handleInputChange("uso_cfdi", value)}>
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
                            <Label htmlFor="metodo_pago">Método de Pago</Label>
                            <Select value={formData.metodo_pago} onValueChange={(value) => handleInputChange("metodo_pago", value)}>
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
                            <Label htmlFor="forma_pago">Forma de Pago</Label>
                            <Select value={formData.forma_pago} onValueChange={(value) => handleInputChange("forma_pago", value)}>
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
                    </TabsContent>

                    <TabsContent value="adicional" className="space-y-4">
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
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="generales">Datos Generales</TabsTrigger>
                  <TabsTrigger value="contacto">Contacto y Dirección</TabsTrigger>
                  <TabsTrigger value="facturacion">Facturación</TabsTrigger>
                  <TabsTrigger value="adicional">Información Adicional</TabsTrigger>
                </TabsList>

              <TabsContent value="generales" className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Padre/Tutor Principal</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="padre_nombre">Nombre Completo *</Label>
                      <Input
                        id="padre_nombre"
                        value={formData.padre_nombre}
                        onChange={(e) => handleInputChange("padre_nombre", e.target.value)}
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
                        value={formData.madre_nombre}
                        onChange={(e) => handleInputChange("madre_nombre", e.target.value)}
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
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Datos Fiscales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="razon_social">Razón Social</Label>
                      <Input
                        id="razon_social"
                        value={formData.razon_social}
                        onChange={(e) => handleInputChange("razon_social", e.target.value)}
                        placeholder="Nombre o razón social para facturación"
                      />
                    </div>
                    <div>
                      <Label htmlFor="rfc">RFC</Label>
                      <Input
                        id="rfc"
                        value={formData.rfc}
                        onChange={(e) => handleInputChange("rfc", e.target.value.toUpperCase())}
                        placeholder="RFC de 12 o 13 caracteres"
                        maxLength={13}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="email_facturacion">Email para Facturación</Label>
                      <Input
                        id="email_facturacion"
                        type="email"
                        value={formData.email_facturacion}
                        onChange={(e) => handleInputChange("email_facturacion", e.target.value)}
                        placeholder="Email donde se enviarán las facturas"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="direccion_fiscal">Dirección Fiscal</Label>
                      <Input
                        id="direccion_fiscal"
                        value={formData.direccion_fiscal}
                        onChange={(e) => handleInputChange("direccion_fiscal", e.target.value)}
                        placeholder="Dirección fiscal registrada en el SAT"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Configuración CFDI</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="uso_cfdi">Uso de CFDI</Label>
                      <Select value={formData.uso_cfdi} onValueChange={(value) => handleInputChange("uso_cfdi", value)}>
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
                      <Label htmlFor="metodo_pago">Método de Pago</Label>
                      <Select value={formData.metodo_pago} onValueChange={(value) => handleInputChange("metodo_pago", value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PUE">PUE - Pago en una exhibición</SelectItem>
                          <SelectItem value="PPD">PPD - Pago en parcialidades</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="forma_pago">Forma de Pago</Label>
                      <Select value={formData.forma_pago} onValueChange={(value) => handleInputChange("forma_pago", value)}>
                        <SelectTrigger>
                          <SelectValue />
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
              </TabsContent>

              <TabsContent value="adicional" className="space-y-4">
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
    </div>
  );
}