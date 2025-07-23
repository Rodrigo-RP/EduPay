import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Search, Edit, Trash2, UserCheck, UserX, Phone, Mail, MapPin, AlertTriangle, FileSpreadsheet, Download, Upload, Eye } from "lucide-react";

export default function Estudiantes() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrado, setSelectedGrado] = useState("all");
  const [selectedGrupo, setSelectedGrupo] = useState("all");
  const [gruposPersonalizados, setGruposPersonalizados] = useState(["A", "B", "C", "D", "E", "F", "G", "H"]);
  const [editandoGrupos, setEditandoGrupos] = useState(false);
  const [nuevoGrupo, setNuevoGrupo] = useState("");
  const [editandoGrupoIndex, setEditandoGrupoIndex] = useState<number | null>(null);
  const [nombreGrupoEditando, setNombreGrupoEditando] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [viewingStudent, setViewingStudent] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("individual");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    nombres: "",
    primer_apellido: "",
    segundo_apellido: "",
    curp: "",
    fecha_nacimiento: "",
    grado: "",
    grupo: "",
    status: "activo",
    responsable_nombre: "",
    responsable_telefono: "",
    responsable_email: "",
    direccion: "",
    codigo_postal: "",
    ciudad: "",
    estado: "Ciudad de México",
    alergias: "",
    medicamentos: "",
    contacto_emergencia: "",
    telefono_emergencia: "",
    // Campos de acceso al portal
    usuario: "",
    password: "",
    id_referencia: ""
  });

  const [estudiantes, setEstudiantes] = useState([
    // Kinder 1
    {
      id: 1,
      nombre_completo: "Emilia Santos Rivera",
      curp: "SARI180920MDFNVM01",
      grado: "Kinder 1",
      grupo: "A",
      status: "activo",
      responsable: "María Rivera Santos",
      telefono: "5551234567",
      saldo_pendiente: 480000,
      fecha_inscripcion: "2024-08-15"
    },
    {
      id: 2,
      nombre_completo: "Santiago Morales Herrera",
      curp: "MOHS190615HDFRRR02",
      grado: "Kinder 1",
      grupo: "A",
      status: "activo",
      responsable: "Carmen Herrera Molina",
      telefono: "5551234568",
      saldo_pendiente: 480000,
      fecha_inscripcion: "2024-08-15"
    },
    // Kinder 2
    {
      id: 3,
      nombre_completo: "Mateo Cruz Flores",
      curp: "CRFM170815HDFRLR07",
      grado: "Kinder 2",
      grupo: "B",
      status: "activo",
      responsable: "Laura Flores García",
      telefono: "5551122334",
      saldo_pendiente: 500000,
      fecha_inscripcion: "2024-08-16"
    },
    {
      id: 4,
      nombre_completo: "Zoe Jiménez Vargas",
      curp: "JIVZ171012MDFMRR08",
      grado: "Kinder 2",
      grupo: "B",
      status: "activo",
      responsable: "Ricardo Jiménez López",
      telefono: "5552233445",
      saldo_pendiente: 350000,
      fecha_inscripcion: "2024-08-16"
    },
    // Kinder 3
    {
      id: 5,
      nombre_completo: "Valentina Ruiz Moreno",
      curp: "RUMV160712MDFZRL03",
      grado: "Kinder 3",
      grupo: "A",
      status: "activo",
      responsable: "José Moreno Ruiz",
      telefono: "5553344556",
      saldo_pendiente: 520000,
      fecha_inscripcion: "2024-08-17"
    },
    {
      id: 6,
      nombre_completo: "Leonardo Castillo Domínguez",
      curp: "CADL160518HDFSTL09",
      grado: "Kinder 3",
      grupo: "A",
      status: "activo",
      responsable: "Elena Domínguez Castro",
      telefono: "5554455667",
      saldo_pendiente: 520000,
      fecha_inscripcion: "2024-08-17"
    },
    // 1ro Primaria
    {
      id: 7,
      nombre_completo: "Carlos Pérez Méndez",
      curp: "PEMC151215HDFRZR09",
      grado: "1ro",
      grupo: "A",
      status: "activo",
      responsable: "Ana Méndez López",
      telefono: "5555566778",
      saldo_pendiente: 580000,
      fecha_inscripcion: "2024-08-18"
    },
    {
      id: 8,
      nombre_completo: "Sofía Guerrero Vázquez",
      curp: "GAVS150322MDFRZF04",
      grado: "1ro",
      grupo: "B",
      status: "activo",
      responsable: "Miguel Guerrero Sánchez",
      telefono: "5556677889",
      saldo_pendiente: 430000,
      fecha_inscripcion: "2024-08-18"
    },
    // 2do Primaria
    {
      id: 9,
      nombre_completo: "Andrea García Luna",
      curp: "GALN140312MDFPPR03",
      grado: "2do",
      grupo: "B",
      status: "activo",
      responsable: "Patricia Luna Vega",
      telefono: "5557788990",
      saldo_pendiente: 600000,
      fecha_inscripcion: "2024-08-19"
    },
    {
      id: 10,
      nombre_completo: "Matías Torres Silva",
      curp: "TOSM140825HDFRLR05",
      grado: "2do",
      grupo: "A",
      status: "activo",
      responsable: "Roberto Torres Medina",
      telefono: "5558899001",
      saldo_pendiente: 600000,
      fecha_inscripcion: "2024-08-19"
    },
    // 3ro Primaria
    {
      id: 11,
      nombre_completo: "Luis Martínez Gil",
      curp: "MAGL130118HDFRNR05",
      grado: "3ro",
      grupo: "C",
      status: "activo",
      responsable: "María Gil Fernández",
      telefono: "5559900112",
      saldo_pendiente: 620000,
      fecha_inscripcion: "2024-08-20"
    },
    {
      id: 12,
      nombre_completo: "Isabella Ramírez Cordova",
      curp: "RACI130907MDFMRS06",
      grado: "3ro",
      grupo: "A",
      status: "activo",
      responsable: "Jorge Ramírez Salinas",
      telefono: "5550011223",
      saldo_pendiente: 470000,
      fecha_inscripcion: "2024-08-20"
    },
    // 4to Primaria
    {
      id: 13,
      nombre_completo: "Emilio Rodríguez Navarro",
      curp: "RONE120615HDFNVR07",
      grado: "4to",
      grupo: "B",
      status: "activo",
      responsable: "Claudia Navarro Torres",
      telefono: "5551122334",
      saldo_pendiente: 640000,
      fecha_inscripcion: "2024-08-21"
    },
    {
      id: 14,
      nombre_completo: "Camila Herrera Sandoval",
      curp: "HESC120403MDFRNL08",
      grado: "4to",
      grupo: "A",
      status: "becado",
      responsable: "Fernando Herrera López",
      telefono: "5552233445",
      saldo_pendiente: 320000,
      fecha_inscripcion: "2024-08-21"
    },
    // 5to Primaria
    {
      id: 15,
      nombre_completo: "Daniel Morales Castro",
      curp: "MOCD111128HDFRTD09",
      grado: "5to",
      grupo: "A",
      status: "activo",
      responsable: "Lucía Castro Morales",
      telefono: "5553344556",
      saldo_pendiente: 660000,
      fecha_inscripcion: "2024-08-22"
    },
    {
      id: 16,
      nombre_completo: "Valeria Sánchez Delgado",
      curp: "SADV110514MDFNLR01",
      grado: "5to",
      grupo: "B",
      status: "activo",
      responsable: "Manuel Sánchez Ruiz",
      telefono: "5554455667",
      saldo_pendiente: 660000,
      fecha_inscripcion: "2024-08-22"
    },
    // 6to Primaria
    {
      id: 17,
      nombre_completo: "Sebastián López Martínez",
      curp: "LOMS100920HDFPRS02",
      grado: "6to",
      grupo: "A",
      status: "activo",
      responsable: "Gloria Martínez Vega",
      telefono: "5555566778",
      saldo_pendiente: 680000,
      fecha_inscripcion: "2024-08-23"
    },
    {
      id: 18,
      nombre_completo: "Regina Vega Salinas",
      curp: "VESR100307MDFGLN03",
      grado: "6to",
      grupo: "C",
      status: "activo",
      responsable: "Adrián Vega Castillo",
      telefono: "5556677889",
      saldo_pendiente: 680000,
      fecha_inscripcion: "2024-08-23"
    },
    // 1ro Secundaria
    {
      id: 19,
      nombre_completo: "Sofía Hernández Castro",
      curp: "HECS090920MDFRZS04",
      grado: "1ro Sec",
      grupo: "A",
      status: "activo",
      responsable: "Roberto Hernández Villa",
      telefono: "5557788990",
      saldo_pendiente: 720000,
      fecha_inscripcion: "2024-08-24"
    },
    {
      id: 20,
      nombre_completo: "Maximiliano Fernández Ramos",
      curp: "FERM090512HDFNRS05",
      grado: "1ro Sec",
      grupo: "B",
      status: "activo",
      responsable: "Teresa Ramos Silva",
      telefono: "5558899001",
      saldo_pendiente: 720000,
      fecha_inscripcion: "2024-08-24"
    },
    // 2do Secundaria
    {
      id: 21,
      nombre_completo: "Miguel Torres Vega",
      curp: "TOVM080715HDFGLR08",
      grado: "2do Sec",
      grupo: "B",
      status: "activo",
      responsable: "Carmen Vega Torres",
      telefono: "5559900112",
      saldo_pendiente: 740000,
      fecha_inscripcion: "2024-08-25"
    },
    {
      id: 22,
      nombre_completo: "Natalia Jiménez Moreno",
      curp: "JIMN080221MDFMRT06",
      grado: "2do Sec",
      grupo: "A",
      status: "activo",
      responsable: "Carlos Jiménez Herrera",
      telefono: "5550011223",
      saldo_pendiente: 590000,
      fecha_inscripcion: "2024-08-25"
    },
    // 3ro Secundaria
    {
      id: 23,
      nombre_completo: "Valeria López Cruz",
      curp: "LOCV070822MDFPRL02",
      grado: "3ro Sec",
      grupo: "C",
      status: "activo",
      responsable: "Eduardo López Mendoza",
      telefono: "5551122334",
      saldo_pendiente: 760000,
      fecha_inscripcion: "2024-08-26"
    },
    {
      id: 24,
      nombre_completo: "Alejandro Rivera Gómez",
      curp: "RIGA070603HDFVLR07",
      grado: "3ro Sec",
      grupo: "A",
      status: "activo",
      responsable: "Silvia Gómez Rivera",
      telefono: "5552233445",
      saldo_pendiente: 760000,
      fecha_inscripcion: "2024-08-26"
    },
    // 1ro Bachillerato
    {
      id: 25,
      nombre_completo: "Diego Ramírez Silva",
      curp: "RASD060305HDFMLG06",
      grado: "1ro Bach",
      grupo: "A",
      status: "activo",
      responsable: "Patricia Silva Ramírez",
      telefono: "5553344556",
      saldo_pendiente: 850000,
      fecha_inscripcion: "2024-08-27"
    },
    {
      id: 26,
      nombre_completo: "Ximena Vargas Delgado",
      curp: "VADX060918MDFRLM08",
      grado: "1ro Bach",
      grupo: "B",
      status: "activo",
      responsable: "Héctor Vargas Romero",
      telefono: "5554455667",
      saldo_pendiente: 850000,
      fecha_inscripcion: "2024-08-27"
    },
    // 2do Bachillerato
    {
      id: 27,
      nombre_completo: "Isabella Morales Ruiz",
      curp: "MORI050412MDFRRZ09",
      grado: "2do Bach",
      grupo: "B",
      status: "activo",
      responsable: "Fernando Morales Castro",
      telefono: "5555566778",
      saldo_pendiente: 870000,
      fecha_inscripcion: "2024-08-28"
    },
    {
      id: 28,
      nombre_completo: "Gabriel Medina Flores",
      curp: "MEFG050124HDFNLR01",
      grado: "2do Bach",
      grupo: "A",
      status: "activo",
      responsable: "Mónica Flores Medina",
      telefono: "5556677889",
      saldo_pendiente: 870000,
      fecha_inscripcion: "2024-08-28"
    },
    // 3ro Bachillerato
    {
      id: 29,
      nombre_completo: "Alejandro Castillo Mendoza",
      curp: "CAMA040528HDFSNL01",
      grado: "3ro Bach",
      grupo: "A",
      status: "activo",
      responsable: "Gabriela Mendoza Castillo",
      telefono: "5557788990",
      saldo_pendiente: 890000,
      fecha_inscripcion: "2024-08-29"
    },
    {
      id: 30,
      nombre_completo: "Victoria Sandoval Guerrero",
      curp: "SAGV040815MDFNTR02",
      grado: "3ro Bach",
      grupo: "B",
      status: "activo",
      responsable: "Raúl Sandoval Herrera",
      telefono: "5558899001",
      saldo_pendiente: 890000,
      fecha_inscripcion: "2024-08-29"
    }
  ]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Función para combinar nombres separados en nombre completo
  const combineNames = (nombres: string, primerApellido: string, segundoApellido: string) => {
    const parts = [nombres, primerApellido, segundoApellido].filter(part => part.trim());
    return parts.join(' ');
  };

  const resetForm = () => {
    setFormData({
      nombres: "",
      primer_apellido: "",
      segundo_apellido: "",
      curp: "",
      fecha_nacimiento: "",
      grado: "",
      grupo: "",
      status: "activo",
      responsable_nombre: "",
      responsable_telefono: "",
      responsable_email: "",
      direccion: "",
      codigo_postal: "",
      ciudad: "",
      estado: "Ciudad de México",
      alergias: "",
      medicamentos: "",
      contacto_emergencia: "",
      telefono_emergencia: "",
      usuario: "",
      password: "",
      id_referencia: ""
    });
  };

  const loadStudentForView = (student: any) => {
    setViewingStudent(student);
    setShowViewModal(true);
  };

  const loadStudentForEdit = (student: any) => {
    // Separar el nombre completo en campos individuales
    const nombreCompleto = student.nombre_completo || "";
    const partesNombre = nombreCompleto.split(" ");
    const nombres = partesNombre.length > 0 ? partesNombre[0] : "";
    const primerApellido = partesNombre.length > 1 ? partesNombre[1] : "";
    const segundoApellido = partesNombre.length > 2 ? partesNombre.slice(2).join(" ") : "";
    
    setFormData({
      nombres: nombres,
      primer_apellido: primerApellido,
      segundo_apellido: segundoApellido,
      curp: student.curp,
      fecha_nacimiento: student.fecha_nacimiento || "",
      grado: student.grado,
      grupo: student.grupo,
      status: student.status,
      responsable_nombre: student.responsable,
      responsable_telefono: student.telefono,
      responsable_email: student.responsable_email || "",
      direccion: student.direccion || "",
      codigo_postal: student.codigo_postal || "",
      ciudad: student.ciudad || "",
      estado: student.estado || "",
      alergias: student.alergias || "",
      medicamentos: student.medicamentos || "",
      contacto_emergencia: student.contacto_emergencia || "",
      telefono_emergencia: student.telefono_emergencia || "",
      usuario: student.usuario || "",
      password: student.password || "",
      id_referencia: student.id_referencia || ""
    });
    setEditingStudent(student);
    setShowEditModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Combinar nombres separados en nombre completo
    const nombreCompleto = combineNames(formData.nombres, formData.primer_apellido, formData.segundo_apellido);
    
    // Validaciones básicas
    if (!formData.nombres || !formData.primer_apellido || !formData.curp || !formData.grado || !formData.responsable_nombre) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos obligatorios.",
        variant: "destructive"
      });
      return;
    }

    // Validar formato CURP (18 caracteres)
    if (formData.curp.length !== 18) {
      toast({
        title: "Error",
        description: "El CURP debe tener 18 caracteres.",
        variant: "destructive"
      });
      return;
    }

    if (editingStudent) {
      // Actualizar estudiante existente
      const updatedStudent = {
        ...editingStudent,
        nombre_completo: nombreCompleto,
        curp: formData.curp,
        grado: formData.grado,
        grupo: formData.grupo,
        status: formData.status,
        responsable: formData.responsable_nombre,
        telefono: formData.responsable_telefono
      };

      setEstudiantes(prev => prev.map(s => s.id === editingStudent.id ? updatedStudent : s));
      
      toast({
        title: "Estudiante actualizado",
        description: `Los datos de ${nombreCompleto} han sido actualizados exitosamente.`
      });

      resetForm();
      setEditingStudent(null);
      setShowEditModal(false);
    } else {
      // Crear nuevo estudiante
      const newId = Math.max(...estudiantes.map(e => e.id)) + 1;
      
      const newStudent = {
        id: newId,
        nombre_completo: nombreCompleto,
        curp: formData.curp,
        grado: formData.grado,
        grupo: formData.grupo,
        status: formData.status,
        responsable: formData.responsable_nombre,
        telefono: formData.responsable_telefono,
        saldo_pendiente: 0,
        fecha_inscripcion: new Date().toISOString().split('T')[0]
      };

      setEstudiantes(prev => [...prev, newStudent]);
      
      toast({
        title: "Estudiante agregado",
        description: `${nombreCompleto} ha sido registrado exitosamente.`
      });

      resetForm();
      setShowAddModal(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<any>(null);

  const handleDelete = (studentId: number) => {
    const student = estudiantes.find(s => s.id === studentId);
    
    if (student && student.saldo_pendiente > 0) {
      toast({
        title: "No se puede eliminar",
        description: "Este estudiante tiene saldo pendiente. Primero liquide las deudas.",
        variant: "destructive"
      });
      return;
    }

    if (student) {
      setStudentToDelete(student);
      setShowDeleteModal(true);
    }
  };

  const confirmDeleteStudent = () => {
    if (!studentToDelete) return;
    
    setEstudiantes(prev => prev.filter(s => s.id !== studentToDelete.id));
    toast({
      title: "Estudiante eliminado",
      description: `${studentToDelete.nombre_completo} ha sido eliminado permanentemente del sistema.`
    });
    
    setShowDeleteModal(false);
    setStudentToDelete(null);
  };

  // Funciones para manejar grupos personalizados
  const agregarGrupo = () => {
    if (nuevoGrupo.trim() && !gruposPersonalizados.includes(nuevoGrupo.trim())) {
      setGruposPersonalizados([...gruposPersonalizados, nuevoGrupo.trim()]);
      setNuevoGrupo("");
      toast({
        title: "Grupo agregado",
        description: `Se agregó el grupo "${nuevoGrupo.trim()}" exitosamente.`,
      });
    }
  };

  const eliminarGrupo = (grupo: string) => {
    if (gruposPersonalizados.length > 1) {
      setGruposPersonalizados(gruposPersonalizados.filter(g => g !== grupo));
      if (selectedGrupo === grupo) {
        setSelectedGrupo("all");
      }
      toast({
        title: "Grupo eliminado",
        description: `Se eliminó el grupo "${grupo}" exitosamente.`,
      });
    }
  };

  const iniciarEdicionGrupo = (index: number) => {
    setEditandoGrupoIndex(index);
    setNombreGrupoEditando(gruposPersonalizados[index]);
  };

  const guardarEdicionGrupo = () => {
    if (nombreGrupoEditando.trim() && !gruposPersonalizados.includes(nombreGrupoEditando.trim())) {
      const nuevosGrupos = [...gruposPersonalizados];
      const grupoAnterior = nuevosGrupos[editandoGrupoIndex!];
      nuevosGrupos[editandoGrupoIndex!] = nombreGrupoEditando.trim();
      setGruposPersonalizados(nuevosGrupos);
      
      // Actualizar filtro si estaba seleccionado el grupo editado
      if (selectedGrupo === grupoAnterior) {
        setSelectedGrupo(nombreGrupoEditando.trim());
      }
      
      toast({
        title: "Grupo actualizado",
        description: `Se cambió el nombre de "${grupoAnterior}" a "${nombreGrupoEditando.trim()}".`,
      });
    }
    cancelarEdicionGrupo();
  };

  const cancelarEdicionGrupo = () => {
    setEditandoGrupoIndex(null);
    setNombreGrupoEditando("");
  };

  // Funciones para importación de Excel
  const generateExcelTemplate = () => {
    const headers = [
      "nombres",
      "primer_apellido",
      "segundo_apellido",
      "curp", 
      "fecha_nacimiento",
      "grado",
      "grupo",
      "responsable_nombre",
      "responsable_telefono",
      "responsable_email",
      "direccion",
      "codigo_postal",
      "ciudad",
      "estado",
      "alergias",
      "medicamentos",
      "contacto_emergencia",
      "telefono_emergencia"
    ];
    
    const exampleData = [
      [
        "María Elena",
        "García",
        "López",
        "GALM120815MDFRRR05",
        "2012-08-15",
        "6to",
        "A",
        "Juan García Martínez",
        "5551234567",
        "juan.garcia@email.com",
        "Calle Reforma 123, Col. Centro",
        "01000",
        "Ciudad de México",
        "Ciudad de México",
        "Ninguna",
        "Vitaminas",
        "Ana López García",
        "5559876543"
      ],
      [
        "Carlos Alberto",
        "Mendoza",
        "Ruiz",
        "MERC110305HDFRRL04",
        "2011-03-05",
        "1ro Sec",
        "B",
        "Patricia Ruiz Mendoza",
        "5552345678",
        "patricia.ruiz@email.com",
        "Av. Insurgentes 456, Col. Roma",
        "06700",
        "Ciudad de México",
        "Ciudad de México",
        "Asma",
        "Inhalador",
        "Roberto Mendoza",
        "5558765432"
      ],
      [
        "Sofía Gabriela",
        "Hernández",
        "Castro",
        "HECS130922MDFRTF06",
        "2013-09-22",
        "Kinder 3",
        "C",
        "Miguel Hernández López",
        "5553456789",
        "miguel.hernandez@email.com",
        "Calle Juárez 789, Col. Centro",
        "01020",
        "Ciudad de México",
        "Ciudad de México",
        "Ninguna",
        "Ninguno",
        "Carmen Castro",
        "5557654321"
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
    link.setAttribute("download", "plantilla_estudiantes.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Plantilla descargada",
      description: "La plantilla Excel ha sido descargada exitosamente con nombres separados (nombres, primer_apellido, segundo_apellido) y 3 ejemplos de estudiantes.",
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
      
      const newStudents: any[] = [];
      
      // Procesar cada línea (excluyendo encabezados)
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const student: any = { id: Date.now() + i, status: "activo" };
          
          headers.forEach((header, index) => {
            if (values[index]) {
              student[header] = values[index];
            }
          });
          
          // Combinar nombres, primer_apellido y segundo_apellido en nombre_completo
          const nombres = student.nombres || "";
          const primerApellido = student.primer_apellido || "";
          const segundoApellido = student.segundo_apellido || "";
          student.nombre_completo = `${nombres} ${primerApellido} ${segundoApellido}`.trim();
          
          // Agregar campos adicionales para compatibilidad
          student.responsable = student.responsable_nombre || "";
          student.telefono = student.responsable_telefono || "";
          student.saldo_pendiente = 0;
          student.fecha_inscripcion = new Date().toISOString().split('T')[0];
          
          newStudents.push(student);
        }
        
        // Actualizar progreso
        setImportProgress(Math.round((i / lines.length) * 100));
      }
      
      // Agregar estudiantes al estado
      setEstudiantes(prev => [...prev, ...newStudents]);
      
      toast({
        title: "Importación exitosa",
        description: `Se importaron ${newStudents.length} estudiantes correctamente.`,
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

  // Filtrar estudiantes según criterios de búsqueda
  const filteredStudents = estudiantes.filter(student => {
    const matchesSearch = student.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.curp.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         student.responsable.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGrado = selectedGrado === "all" || student.grado === selectedGrado;
    const matchesGrupo = selectedGrupo === "all" || student.grupo === selectedGrupo;
    return matchesSearch && matchesGrado && matchesGrupo;
  });

  const estadisticas = {
    total: estudiantes.length,
    activos: estudiantes.filter(s => s.status === "activo").length,
    saldoPendiente: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0),
    promedioSaldo: estudiantes.reduce((sum, s) => sum + s.saldo_pendiente, 0) / estudiantes.length
  };

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
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl md:text-3xl font-bold text-blue-600 mb-1">Gestión de Estudiantes</h1>
                  <p className="text-sm md:text-base text-slate-600">Administra alumnos, responsables y información académica</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Agregar Estudiante
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
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Total estudiantes</p>
                  <p className="text-lg md:text-2xl font-bold text-blue-600 truncate">{estadisticas.total}</p>
                  <div className="text-xs text-green-600 mt-1">+{estadisticas.activos} activos</div>
                </div>
                <div className="text-blue-500 flex-shrink-0">
                  <Users className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Estudiantes activos</p>
                  <p className="text-lg md:text-2xl font-bold text-blue-600 truncate">{estadisticas.activos}</p>
                  <div className="text-xs text-green-600 mt-1">Estado saludable</div>
                </div>
                <div className="text-green-500 flex-shrink-0">
                  <UserCheck className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Saldo pendiente total</p>
                  <p className="text-lg md:text-2xl font-bold text-blue-600 truncate">${(estadisticas.saldoPendiente / 100).toLocaleString()}</p>
                  <div className="text-xs text-orange-600 mt-1">Por cobrar</div>
                </div>
                <div className="text-orange-500 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 p-3 md:p-5">
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs md:text-sm text-slate-600 mb-1">Promedio por estudiante</p>
                  <p className="text-lg md:text-2xl font-bold text-blue-600 truncate">${(estadisticas.promedioSaldo / 100).toLocaleString()}</p>
                  <div className="text-xs text-blue-600 mt-1">Promedio general</div>
                </div>
                <div className="text-purple-500 flex-shrink-0">
                  <FileSpreadsheet className="h-5 w-5 md:h-7 md:w-7" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="bg-white rounded-xl md:rounded-2xl shadow-lg border-0 mb-4 md:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Search className="w-5 h-5" />
              Filtros y búsqueda
            </CardTitle>
          </CardHeader>
          <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <div>
              <Label htmlFor="search">Buscar estudiante</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  id="search"
                  placeholder="Nombre, CURP o responsable..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label>Filtrar por grado</Label>
              <Select value={selectedGrado} onValueChange={setSelectedGrado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grados</SelectItem>
                  <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                  <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                  <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                  <SelectItem value="1ro">1ro Primaria</SelectItem>
                  <SelectItem value="2do">2do Primaria</SelectItem>
                  <SelectItem value="3ro">3ro Primaria</SelectItem>
                  <SelectItem value="4to">4to Primaria</SelectItem>
                  <SelectItem value="5to">5to Primaria</SelectItem>
                  <SelectItem value="6to">6to Primaria</SelectItem>
                  <SelectItem value="1ro Sec">1ro Secundaria</SelectItem>
                  <SelectItem value="2do Sec">2do Secundaria</SelectItem>
                  <SelectItem value="3ro Sec">3ro Secundaria</SelectItem>
                  <SelectItem value="1ro Bach">1ro Bachillerato</SelectItem>
                  <SelectItem value="2do Bach">2do Bachillerato</SelectItem>
                  <SelectItem value="3ro Bach">3ro Bachillerato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Filtrar por grupo</Label>
              <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los grupos</SelectItem>
                  {gruposPersonalizados.map(grupo => (
                    <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end space-x-2">
              <Button variant="outline" onClick={() => {
                setSearchTerm("");
                setSelectedGrado("all");
                setSelectedGrupo("all");
              }}>
                Limpiar filtros
              </Button>
              <Button 
                onClick={() => setEditandoGrupos(true)} 
                variant="outline"
                size="sm"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Lista de estudiantes */}
        <Card className="bg-white rounded-2xl shadow-lg border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Users className="w-5 h-5" />
              Lista de estudiantes ({filteredStudents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredStudents.map((student) => (
                <div key={student.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors border-l-4 border-blue-500">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center">
                      <span className="text-blue-600 font-bold text-lg">
                        {student.nombre_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-slate-900">{student.nombre_completo}</h3>
                      <p className="text-sm text-slate-600 font-medium">{student.grado} {student.grupo} • CURP: {student.curp}</p>
                      <p className="text-xs text-slate-500">Responsable: {student.responsable} • {student.telefono}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-xl font-bold text-blue-600">${(student.saldo_pendiente / 100).toLocaleString()}</div>
                      <div className="text-xs text-slate-500">Saldo pendiente</div>
                    </div>
                    <Badge variant={student.status === 'activo' ? 'default' : 'secondary'} 
                           className={student.status === 'activo' ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                      {student.status}
                    </Badge>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline" onClick={() => loadStudentForView(student)} 
                              title="Ver información del estudiante"
                              className="rounded-lg border-blue-200 hover:bg-blue-50">
                        <Eye className="w-4 h-4 text-blue-600" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(student.id)} 
                              title="Eliminar estudiante"
                              className="rounded-lg border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700">
                        <UserX className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      {/* Modal para agregar/editar estudiante */}
      <Dialog open={showAddModal || showEditModal} onOpenChange={(open) => {
        if (!open) {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingStudent(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStudent ? 'Editar Estudiante' : 'Agregar Nuevo Estudiante'}</DialogTitle>
            <DialogDescription>
              {editingStudent ? 'Modifica la información del estudiante' : 'Agrega un nuevo estudiante individual o importa múltiples estudiantes desde Excel'}
            </DialogDescription>
          </DialogHeader>
          
          {!editingStudent ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="individual">
                  <Plus className="w-4 h-4 mr-2" />
                  Individual
                </TabsTrigger>
                <TabsTrigger value="excel">
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Importar Excel
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="individual">
                <form onSubmit={handleSubmit} className="space-y-6">
            {/* Información del Estudiante */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Estudiante</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="nombres">Nombres *</Label>
                  <Input
                    id="nombres"
                    value={formData.nombres}
                    onChange={(e) => handleInputChange("nombres", e.target.value)}
                    placeholder="Nombres del estudiante"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="primer_apellido">Primer Apellido *</Label>
                  <Input
                    id="primer_apellido"
                    value={formData.primer_apellido}
                    onChange={(e) => handleInputChange("primer_apellido", e.target.value)}
                    placeholder="Primer apellido"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="segundo_apellido">Segundo Apellido</Label>
                  <Input
                    id="segundo_apellido"
                    value={formData.segundo_apellido}
                    onChange={(e) => handleInputChange("segundo_apellido", e.target.value)}
                    placeholder="Segundo apellido"
                  />
                </div>
                <div>
                  <Label htmlFor="curp">CURP *</Label>
                  <Input
                    id="curp"
                    value={formData.curp}
                    onChange={(e) => handleInputChange("curp", e.target.value.toUpperCase())}
                    placeholder="18 caracteres del CURP"
                    maxLength={18}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
                  <Input
                    id="fecha_nacimiento"
                    type="date"
                    value={formData.fecha_nacimiento}
                    onChange={(e) => handleInputChange("fecha_nacimiento", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="grado">Grado *</Label>
                  <Select value={formData.grado} onValueChange={(value) => handleInputChange("grado", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                      <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                      <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                      <SelectItem value="1ro">1ro Primaria</SelectItem>
                      <SelectItem value="2do">2do Primaria</SelectItem>
                      <SelectItem value="3ro">3ro Primaria</SelectItem>
                      <SelectItem value="4to">4to Primaria</SelectItem>
                      <SelectItem value="5to">5to Primaria</SelectItem>
                      <SelectItem value="6to">6to Primaria</SelectItem>
                      <SelectItem value="1ro Sec">1ro Secundaria</SelectItem>
                      <SelectItem value="2do Sec">2do Secundaria</SelectItem>
                      <SelectItem value="3ro Sec">3ro Secundaria</SelectItem>
                      <SelectItem value="1ro Bach">1ro Bachillerato</SelectItem>
                      <SelectItem value="2do Bach">2do Bachillerato</SelectItem>
                      <SelectItem value="3ro Bach">3ro Bachillerato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="grupo">Grupo</Label>
                  <Select value={formData.grupo} onValueChange={(value) => handleInputChange("grupo", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      {gruposPersonalizados.map(grupo => (
                        <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="status">Estado</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Información del Responsable */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Responsable</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="responsable_nombre">Nombre del Responsable *</Label>
                  <Input
                    id="responsable_nombre"
                    value={formData.responsable_nombre}
                    onChange={(e) => handleInputChange("responsable_nombre", e.target.value)}
                    placeholder="Padre, madre o tutor"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="responsable_telefono">Teléfono *</Label>
                  <Input
                    id="responsable_telefono"
                    value={formData.responsable_telefono}
                    onChange={(e) => handleInputChange("responsable_telefono", e.target.value)}
                    placeholder="10 dígitos"
                    maxLength={10}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="responsable_email">Correo Electrónico</Label>
                  <Input
                    id="responsable_email"
                    type="email"
                    value={formData.responsable_email}
                    onChange={(e) => handleInputChange("responsable_email", e.target.value)}
                    placeholder="correo@ejemplo.com"
                  />
                </div>
              </div>
            </div>

            {/* Dirección */}
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
                  <Label htmlFor="codigo_postal">Código Postal</Label>
                  <Input
                    id="codigo_postal"
                    value={formData.codigo_postal}
                    onChange={(e) => handleInputChange("codigo_postal", e.target.value)}
                    placeholder="5 dígitos"
                    maxLength={5}
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
              </div>
            </div>

            {/* Información Médica y Emergencias */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Información Médica y Emergencias</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="alergias">Alergias</Label>
                  <Textarea
                    id="alergias"
                    value={formData.alergias}
                    onChange={(e) => handleInputChange("alergias", e.target.value)}
                    placeholder="Alergias conocidas del estudiante"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="medicamentos">Medicamentos</Label>
                  <Textarea
                    id="medicamentos"
                    value={formData.medicamentos}
                    onChange={(e) => handleInputChange("medicamentos", e.target.value)}
                    placeholder="Medicamentos que toma regularmente"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="contacto_emergencia">Contacto de Emergencia</Label>
                  <Input
                    id="contacto_emergencia"
                    value={formData.contacto_emergencia}
                    onChange={(e) => handleInputChange("contacto_emergencia", e.target.value)}
                    placeholder="Nombre del contacto de emergencia"
                  />
                </div>
                <div>
                  <Label htmlFor="telefono_emergencia">Teléfono de Emergencia</Label>
                  <Input
                    id="telefono_emergencia"
                    value={formData.telefono_emergencia}
                    onChange={(e) => handleInputChange("telefono_emergencia", e.target.value)}
                    placeholder="Teléfono del contacto de emergencia"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>

            {/* Credenciales del Portal */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Credenciales del Portal</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div>
                  <Label htmlFor="id_referencia">ID de Refereence</Label>
                  <Input
                    id="id_referencia"
                    value={formData.id_referencia}
                    onChange={(e) => handleInputChange("id_referencia", e.target.value)}
                    placeholder="ID único de refereence"
                  />
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-2">
                Estas credenciales permitirán al responsable del estudiante acceder al portal de pagos.
              </p>
            </div>

            {/* Botones */}
            <div className="flex justify-end space-x-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {
                resetForm();
                setShowAddModal(false);
                setShowEditModal(false);
                setEditingStudent(null);
              }}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                {editingStudent ? (
                  <>
                    <Edit className="w-4 h-4 mr-2" />
                    Actualizar Estudiante
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Agregar Estudiante
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>
        
        <TabsContent value="excel">
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Importación masiva desde Excel</h3>
              <p className="text-sm text-blue-700 mb-4">
                Descarga la plantilla, completa los datos de los estudiantes y sube el archivo para importar múltiples estudiantes a la vez.
              </p>
              <Button onClick={generateExcelTemplate} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-100">
                <Download className="w-4 h-4 mr-2" />
                Descargar Plantilla Excel
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="excel-file">Seleccionar archivo Excel/CSV</Label>
                <Input
                  id="excel-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                  className="mt-2"
                />
                {importFile && (
                  <p className="text-sm text-green-600 mt-2">
                    Archivo seleccionado: {importFile.name}
                  </p>
                )}
              </div>

              {importProgress > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  ></div>
                </div>
              )}

              <div className="bg-amber-50 p-4 rounded-lg">
                <h4 className="font-semibold text-amber-900 mb-2">Formato de la plantilla:</h4>
                <p className="text-sm text-amber-700 mb-2">
                  La plantilla incluye <strong>18 campos obligatorios</strong> en el siguiente orden:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-amber-700">
                  <div>
                    <p><strong>Información del estudiante:</strong></p>
                    <ul className="ml-4 space-y-1">
                      <li>• nombres</li>
                      <li>• primer_apellido</li>
                      <li>• segundo_apellido</li>
                      <li>• curp (18 caracteres)</li>
                      <li>• fecha_nacimiento (YYYY-MM-DD)</li>
                      <li>• grado</li>
                      <li>• grupo</li>
                    </ul>
                  </div>
                  <div>
                    <p><strong>Información del responsable:</strong></p>
                    <ul className="ml-4 space-y-1">
                      <li>• responsable_nombre</li>
                      <li>• responsable_telefono</li>
                      <li>• responsable_email</li>
                    </ul>
                  </div>
                  <div>
                    <p><strong>Dirección:</strong></p>
                    <ul className="ml-4 space-y-1">
                      <li>• direccion</li>
                      <li>• codigo_postal</li>
                      <li>• ciudad</li>
                      <li>• estado</li>
                    </ul>
                  </div>
                  <div>
                    <p><strong>Información médica:</strong></p>
                    <ul className="ml-4 space-y-1">
                      <li>• alergias</li>
                      <li>• medicamentos</li>
                      <li>• contacto_emergencia</li>
                      <li>• telefono_emergencia</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => {
                setImportFile(null);
                setShowAddModal(false);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}>
                Cancelar
              </Button>
              <Button 
                onClick={processExcelImport} 
                disabled={!importFile || isImporting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Estudiantes
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    ) : (
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Toda la información del estudiante para modo edición */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Estudiante</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="nombres">Nombres *</Label>
              <Input
                id="nombres"
                value={formData.nombres}
                onChange={(e) => handleInputChange("nombres", e.target.value)}
                placeholder="Nombres del estudiante"
                required
              />
            </div>
            <div>
              <Label htmlFor="primer_apellido">Primer Apellido *</Label>
              <Input
                id="primer_apellido"
                value={formData.primer_apellido}
                onChange={(e) => handleInputChange("primer_apellido", e.target.value)}
                placeholder="Primer apellido"
                required
              />
            </div>
            <div>
              <Label htmlFor="segundo_apellido">Segundo Apellido</Label>
              <Input
                id="segundo_apellido"
                value={formData.segundo_apellido}
                onChange={(e) => handleInputChange("segundo_apellido", e.target.value)}
                placeholder="Segundo apellido"
              />
            </div>
            <div>
              <Label htmlFor="curp">CURP *</Label>
              <Input
                id="curp"
                value={formData.curp}
                onChange={(e) => handleInputChange("curp", e.target.value.toUpperCase())}
                placeholder="18 caracteres del CURP"
                maxLength={18}
                required
              />
            </div>
            <div>
              <Label htmlFor="fecha_nacimiento">Fecha de Nacimiento</Label>
              <Input
                id="fecha_nacimiento"
                type="date"
                value={formData.fecha_nacimiento}
                onChange={(e) => handleInputChange("fecha_nacimiento", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="grado">Grado *</Label>
              <Select value={formData.grado} onValueChange={(value) => handleInputChange("grado", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar grado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kinder 1">Kinder 1</SelectItem>
                  <SelectItem value="Kinder 2">Kinder 2</SelectItem>
                  <SelectItem value="Kinder 3">Kinder 3</SelectItem>
                  <SelectItem value="1ro">1ro Primaria</SelectItem>
                  <SelectItem value="2do">2do Primaria</SelectItem>
                  <SelectItem value="3ro">3ro Primaria</SelectItem>
                  <SelectItem value="4to">4to Primaria</SelectItem>
                  <SelectItem value="5to">5to Primaria</SelectItem>
                  <SelectItem value="6to">6to Primaria</SelectItem>
                  <SelectItem value="1ro Sec">1ro Secundaria</SelectItem>
                  <SelectItem value="2do Sec">2do Secundaria</SelectItem>
                  <SelectItem value="3ro Sec">3ro Secundaria</SelectItem>
                  <SelectItem value="1ro Bach">1ro Bachillerato</SelectItem>
                  <SelectItem value="2do Bach">2do Bachillerato</SelectItem>
                  <SelectItem value="3ro Bach">3ro Bachillerato</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="grupo">Grupo</Label>
              <Select value={formData.grupo} onValueChange={(value) => handleInputChange("grupo", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar grupo" />
                </SelectTrigger>
                <SelectContent>
                  {gruposPersonalizados.map(grupo => (
                    <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                  <SelectItem value="suspendido">Suspendido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Información del Responsable */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Información del Responsable</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="responsable_nombre">Nombre del Responsable *</Label>
              <Input
                id="responsable_nombre"
                value={formData.responsable_nombre}
                onChange={(e) => handleInputChange("responsable_nombre", e.target.value)}
                placeholder="Padre, madre o tutor"
                required
              />
            </div>
            <div>
              <Label htmlFor="responsable_telefono">Teléfono *</Label>
              <Input
                id="responsable_telefono"
                value={formData.responsable_telefono}
                onChange={(e) => handleInputChange("responsable_telefono", e.target.value)}
                placeholder="10 dígitos"
                maxLength={10}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="responsable_email">Correo Electrónico</Label>
              <Input
                id="responsable_email"
                type="email"
                value={formData.responsable_email}
                onChange={(e) => handleInputChange("responsable_email", e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>
          </div>
        </div>

        {/* Dirección */}
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
              <Label htmlFor="codigo_postal">Código Postal</Label>
              <Input
                id="codigo_postal"
                value={formData.codigo_postal}
                onChange={(e) => handleInputChange("codigo_postal", e.target.value)}
                placeholder="5 dígitos"
                maxLength={5}
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
          </div>
        </div>

        {/* Información Médica y Emergencias */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Información Médica y Emergencias</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="alergias">Alergias</Label>
              <Textarea
                id="alergias"
                value={formData.alergias}
                onChange={(e) => handleInputChange("alergias", e.target.value)}
                placeholder="Alergias conocidas del estudiante"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="medicamentos">Medicamentos</Label>
              <Textarea
                id="medicamentos"
                value={formData.medicamentos}
                onChange={(e) => handleInputChange("medicamentos", e.target.value)}
                placeholder="Medicamentos que toma regularmente"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="contacto_emergencia">Contacto de Emergencia</Label>
              <Input
                id="contacto_emergencia"
                value={formData.contacto_emergencia}
                onChange={(e) => handleInputChange("contacto_emergencia", e.target.value)}
                placeholder="Nombre del contacto de emergencia"
              />
            </div>
            <div>
              <Label htmlFor="telefono_emergencia">Teléfono de Emergencia</Label>
              <Input
                id="telefono_emergencia"
                value={formData.telefono_emergencia}
                onChange={(e) => handleInputChange("telefono_emergencia", e.target.value)}
                placeholder="Teléfono del contacto de emergencia"
                maxLength={10}
              />
            </div>
          </div>
        </div>

        {/* Credenciales de Acceso al Portal */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Credenciales de Acceso al Portal</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="usuario">Usuario</Label>
              <Input
                id="usuario"
                value={formData.usuario}
                onChange={(e) => handleInputChange("usuario", e.target.value)}
                placeholder="Usuario para acceso al portal"
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => handleInputChange("password", e.target.value)}
                placeholder="Contraseña para acceso al portal"
              />
            </div>
            <div>
              <Label htmlFor="id_referencia">ID de Refereence</Label>
              <Input
                id="id_referencia"
                value={formData.id_referencia}
                onChange={(e) => handleInputChange("id_referencia", e.target.value)}
                placeholder="ID único de refereence"
              />
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="flex justify-end space-x-4 pt-4 border-t">
          <Button type="button" variant="outline" onClick={() => {
            resetForm();
            setShowAddModal(false);
            setShowEditModal(false);
            setEditingStudent(null);
          }}>
            Cancelar
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            <Edit className="w-4 h-4 mr-2" />
            Actualizar Estudiante
          </Button>
        </div>
      </form>
    )}
        </DialogContent>
      </Dialog>

      {/* Modal para ver información del estudiante */}
      <Dialog open={showViewModal} onOpenChange={(open) => {
        if (!open) {
          setShowViewModal(false);
          setViewingStudent(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Información del Estudiante</DialogTitle>
            <DialogDescription>
              Visualiza toda la información del estudiante seleccionado
            </DialogDescription>
          </DialogHeader>
          
          {viewingStudent && (
            <div className="space-y-6">
              {/* Información del Estudiante */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-blue-600" />
                  Información del Estudiante
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Nombre Completo</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.nombre_completo}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">CURP</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.curp}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Fecha de Nacimiento</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.fecha_nacimiento || "No especificada"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Grado</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.grado}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Grupo</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.grupo}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Estado</Label>
                    <Badge variant={viewingStudent.status === 'activo' ? 'default' : 'secondary'} className="mt-1">
                      {viewingStudent.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Información del Responsable */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <Phone className="w-5 h-5 mr-2 text-green-600" />
                  Información del Responsable
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Nombre del Responsable</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.responsable}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Teléfono</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.telefono}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Correo Electrónico</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.responsable_email || "No especificado"}</p>
                  </div>
                </div>
              </div>

              {/* Dirección */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <MapPin className="w-5 h-5 mr-2 text-purple-600" />
                  Dirección
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-slate-600">Dirección Completa</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.direccion || "No especificada"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Código Postal</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.codigo_postal || "No especificado"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Ciudad</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.ciudad || "No especificada"}</p>
                  </div>
                </div>
              </div>

              {/* Información Médica */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2 text-red-600" />
                  Información Médica
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Alergias</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.alergias || "Ninguna"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Medicamentos</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.medicamentos || "Ninguno"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Contacto de Emergencia</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.contacto_emergencia || "No especificado"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Teléfono de Emergencia</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.telefono_emergencia || "No especificado"}</p>
                  </div>
                </div>
              </div>

              {/* Información Financiera */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-yellow-600" />
                  Información Financiera
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Saldo Pendiente</Label>
                    <p className="text-lg font-semibold text-slate-900 mt-1">${(viewingStudent.saldo_pendiente / 100).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Fecha de Inscripción</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.fecha_inscripcion || "No especificada"}</p>
                  </div>
                </div>
              </div>

              {/* Credenciales de Acceso */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center">
                  <UserCheck className="w-5 h-5 mr-2 text-indigo-600" />
                  Credenciales de Acceso al Portal
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Usuario</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.usuario || "No asignado"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">Contraseña</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.password ? "•••••••••" : "No asignada"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-slate-600">ID de Refereence</Label>
                    <p className="text-sm text-slate-900 mt-1">{viewingStudent.id_referencia || "No asignado"}</p>
                  </div>
                </div>
              </div>

              {/* Botón de Editar */}
              <div className="flex justify-end pt-4">
                <Button 
                  onClick={() => {
                    setShowViewModal(false);
                    loadStudentForEdit(viewingStudent);
                  }}
                  className="flex items-center space-x-2"
                >
                  <Edit className="w-4 h-4" />
                  <span>Editar Información</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal para editar grupos */}
      <Dialog open={editandoGrupos} onOpenChange={setEditandoGrupos}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Personalizar grupos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Grupos actuales</Label>
              <div className="space-y-2 mt-2">
                {gruposPersonalizados.map((grupo, index) => (
                  <div key={grupo} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    {editandoGrupoIndex === index ? (
                      <div className="flex items-center space-x-2 flex-1">
                        <Input
                          value={nombreGrupoEditando}
                          onChange={(e) => setNombreGrupoEditando(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') guardarEdicionGrupo();
                            if (e.key === 'Escape') cancelarEdicionGrupo();
                          }}
                          className="h-7"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={guardarEdicionGrupo}
                          className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                          disabled={!nombreGrupoEditando.trim() || gruposPersonalizados.includes(nombreGrupoEditando.trim())}
                        >
                          <UserCheck className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={cancelarEdicionGrupo}
                          className="h-6 w-6 p-0 text-gray-600 hover:text-gray-700"
                        >
                          <UserX className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span>{grupo}</span>
                        <div className="flex space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => iniciarEdicionGrupo(index)}
                            className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          {gruposPersonalizados.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => eliminarGrupo(grupo)}
                              className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <Label htmlFor="nuevoGrupo">Agregar nuevo grupo</Label>
              <div className="flex space-x-2 mt-1">
                <Input
                  id="nuevoGrupo"
                  value={nuevoGrupo}
                  onChange={(e) => setNuevoGrupo(e.target.value)}
                  placeholder="Ej: I, II, Alpha, etc."
                  onKeyPress={(e) => e.key === 'Enter' && agregarGrupo()}
                />
                <Button onClick={agregarGrupo} disabled={!nuevoGrupo.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={() => setEditandoGrupos(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación de eliminación */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              Advertencia de Eliminación
            </DialogTitle>
            <DialogDescription>
              Confirma la eliminación permanente del estudiante del sistema
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-slate-600 mb-4">
              ¿Estás completamente seguro de que deseas eliminar al estudiante{" "}
              <strong className="text-slate-900">"{studentToDelete?.nombre_completo}"</strong>?
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                Esta acción NO se puede deshacer y eliminará:
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• Todos los datos académicos del estudiante</li>
                <li>• Historial de pagos y cargos</li>
                <li>• Información de responsables y contactos</li>
                <li>• Registros de asistencia y calificaciones</li>
              </ul>
            </div>
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowDeleteModal(false);
                setStudentToDelete(null);
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={confirmDeleteStudent}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <UserX className="w-4 h-4 mr-2" />
              Eliminar Estudiante
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}