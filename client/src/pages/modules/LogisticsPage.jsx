import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";

const initialLine = { denumire: "", um: "buc", cantitate: "", cod_nc: "" };
const initialDocument = {
  tip: "aviz",
  numar: "",
  data: new Date().toISOString().slice(0, 10),
  status: "draft",
  expeditor: "",
  destinatar: "",
  adresa_incarcare: "",
  adresa_livrare: "",
  transportator: "",
  vehicul: "",
  remorca: "",
  sofer: "",
  referinta_externa: "",
  comanda_id: "",
  comanda_numar: "",
  crm_comanda_id: "",
  crm_comanda_numar: "",
  crm_client: "",
  contract_id: "",
  contract_numar: "",
  cursa_id: "",
  cursa_numar: "",
  observatii: "",
  linii: [initialLine],
};
const initialTrip = {
  numar: "",
  data: new Date().toISOString().slice(0, 10),
  status: "planificata",
  expeditor: "",
  destinatar: "",
  adresa_incarcare: "",
  adresa_livrare: "",
  plecare_planificata: "",
  sosire_planificata: "",
  transportator: "",
  vehicul_id: "",
  vehicul: "",
  remorca: "",
  sofer_id: "",
  sofer: "",
  comanda_id: "",
  comanda_numar: "",
  crm_comanda_id: "",
  crm_comanda_numar: "",
  crm_client: "",
  contract_id: "",
  contract_numar: "",
  cost_moneda: "RON",
  cost_estimat: "",
  cost_real: "",
  cost_observatii: "",
  plecare_efectiva: "",
  sosire_efectiva: "",
  executie_observatii: "",
  observatii: "",
  linii: [initialLine],
};
const typeLabels = {
  aviz: "Aviz de însoțire",
  cmr: "CMR",
  bon_transport: "Bon transport",
  pod: "Dovadă de livrare",
};
const documentStatusLabels = {
  draft: "Draft",
  emis: "Emis",
  predat: "Predat transportatorului",
  livrat: "Livrat",
  anulat: "Anulat",
};
const tripStatusLabels = {
  planificata: "Planificată",
  alocata: "Alocată",
  in_cursa: "În cursă",
  sosita: "Sosită",
  livrata: "Livrată",
  anulata: "Anulată",
};
const statusTone = {
  draft: "default",
  emis: "info",
  predat: "warning",
  livrat: "success",
  anulat: "danger",
  planificata: "default",
  alocata: "info",
  in_cursa: "warning",
  sosita: "info",
  livrata: "success",
  anulata: "danger",
};
const etransportStatusOptions = [
  { value: "neanalizat", label: "Neanalizat" },
  { value: "verificat_fara_declarare", label: "Verificat – fără declarare" },
  { value: "declarare_necesara", label: "Necesită declarare" },
  { value: "declarat_manual", label: "Declarat manual (UIT înregistrat)" },
];
const gpsAdapterStatusOptions = [
  { value: "neconectat", label: "Neconectat" },
  {
    value: "configurat_fara_date_live",
    label: "Configurat – fără date live în Logistică",
  },
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const formFrom = (source, initial) =>
  source
    ? {
        ...clone(initial),
        ...source,
        linii: source.linii?.length ? source.linii : [clone(initialLine)],
      }
    : clone(initial);

function LineEditor({ lines, onChange }) {
  const update = (index, key, value) =>
    onChange(
      lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [key]: value } : line,
      ),
    );
  return (
    <fieldset className="rounded-md border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">
        Poziții transportate
      </legend>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div
            key={index}
            className="grid gap-2 md:grid-cols-[1fr_6rem_8rem_9rem_auto]"
          >
            <Input
              aria-label={`Denumire poziție ${index + 1}`}
              placeholder="Denumire"
              value={line.denumire}
              onChange={(event) =>
                update(index, "denumire", event.target.value)
              }
            />
            <Input
              aria-label={`UM poziție ${index + 1}`}
              placeholder="UM"
              value={line.um}
              onChange={(event) => update(index, "um", event.target.value)}
            />
            <Input
              aria-label={`Cantitate poziție ${index + 1}`}
              type="number"
              step="0.001"
              placeholder="Cantitate"
              value={line.cantitate}
              onChange={(event) =>
                update(index, "cantitate", event.target.value)
              }
            />
            <Input
              aria-label={`Cod NC poziție ${index + 1}`}
              placeholder="Cod NC opțional"
              value={line.cod_nc}
              onChange={(event) => update(index, "cod_nc", event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={lines.length === 1}
              onClick={() =>
                onChange(lines.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              Șterge
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="mt-3"
        onClick={() => onChange([...lines, clone(initialLine)])}
      >
        + Poziție
      </Button>
    </fieldset>
  );
}

export default function LogisticsPage() {
  const [documents, setDocuments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [context, setContext] = useState({
    orders: [],
    customer_orders: [],
    contracts: [],
    assets: [],
    drivers: [],
    trips: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState("trips");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [monitoringFilter, setMonitoringFilter] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [reportFilters, setReportFilters] = useState({ from: "", to: "" });
  const [tripModal, setTripModal] = useState(false);
  const [documentModal, setDocumentModal] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [tripForm, setTripForm] = useState(formFrom(null, initialTrip));
  const [documentForm, setDocumentForm] = useState(
    formFrom(null, initialDocument),
  );
  const [planning, setPlanning] = useState(null);
  const [evidenceModal, setEvidenceModal] = useState(false);
  const [evidenceTrip, setEvidenceTrip] = useState(null);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({
    primit_de: "",
    primit_la: new Date().toISOString().slice(0, 16),
    observatii: "",
  });
  const [executionModal, setExecutionModal] = useState(false);
  const [executionTrip, setExecutionTrip] = useState(null);
  const [executionAction, setExecutionAction] = useState("start");
  const [executionForm, setExecutionForm] = useState({
    moment: new Date().toISOString().slice(0, 16),
    observatii: "",
  });
  const [stockPreparationModal, setStockPreparationModal] = useState(false);
  const [stockPreparationTrip, setStockPreparationTrip] = useState(null);
  const [stockPreparation, setStockPreparation] = useState(null);
  const [stockPreparationNote, setStockPreparationNote] = useState("");
  const [etransportModal, setEtransportModal] = useState(false);
  const [etransportTrip, setEtransportTrip] = useState(null);
  const [etransportForm, setEtransportForm] = useState({
    status: "neanalizat",
    uit: "",
    referinta_interna: "",
    observatii: "",
  });
  const [gpsAdapterModal, setGpsAdapterModal] = useState(false);
  const [gpsAdapterTrip, setGpsAdapterTrip] = useState(null);
  const [gpsAdapterForm, setGpsAdapterForm] = useState({
    status: "neconectat",
    adaptor: "",
    device_reference: "",
    observatii: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [documentsResponse, tripsResponse, contextResponse] =
        await Promise.all([
          api.get("/logistics/documents"),
          api.get("/logistics/trips"),
          api.get("/logistics/context"),
        ]);
      setDocuments(documentsResponse.data.documents || []);
      setTrips(tripsResponse.data.trips || []);
      setContext(contextResponse.data || {});
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Nu am putut încărca datele logistice.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function loadReport(filters = reportFilters) {
    setReportLoading(true);
    setError("");
    try {
      const response = await api.get("/logistics/reports/operational", {
        params: filters,
      });
      setReport(response.data.report || null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Raportul logistic nu a putut fi încărcat.",
      );
    } finally {
      setReportLoading(false);
    }
  }
  async function downloadReport() {
    try {
      const response = await api.get("/logistics/reports/operational", {
        params: { ...reportFilters, format: "xlsx" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = "Raport-logistica.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Raportul Excel nu a putut fi descărcat.",
      );
    }
  }
  const visibleTrips = useMemo(
    () =>
      trips
        .filter(
          (item) =>
            !query ||
            `${item.numar} ${item.expeditor} ${item.destinatar} ${item.vehicul} ${item.sofer} ${item.comanda_numar || ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .filter((item) => !status || item.status === status)
        .filter((item) =>
          !monitoringFilter
            ? true
            : monitoringFilter === "intarzieri"
              ? Boolean(item.monitoring?.has_delay)
              : Boolean(item.monitoring?.pending_delivery_confirmation),
        ),
    [trips, query, status, monitoringFilter],
  );
  const visibleDocuments = useMemo(
    () =>
      documents
        .filter(
          (item) =>
            !query ||
            `${item.numar} ${item.expeditor} ${item.destinatar} ${item.cursa_numar || ""} ${item.comanda_numar || ""}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .filter((item) => !status || item.status === status),
    [documents, query, status],
  );
  const monitoringSummary = useMemo(
    () => ({
      intarzieri: trips.filter((item) => item.monitoring?.has_delay).length,
      livrariNeconfirmate: trips.filter(
        (item) => item.monitoring?.pending_delivery_confirmation,
      ).length,
    }),
    [trips],
  );
  const setTrip = (key, value) => {
    setPlanning(null);
    setTripForm((current) => ({ ...current, [key]: value }));
  };
  const setDocument = (key, value) =>
    setDocumentForm((current) => ({ ...current, [key]: value }));
  const orderOptions = [
    { value: "", label: "Fără comandă legată" },
    ...(context.orders || []).map((item) => ({
      value: item.id,
      label: `${item.numar}${item.partener ? ` — ${item.partener}` : ""}`,
    })),
  ];
  const customerOrderOptions = [
    { value: "", label: "Fără comandă client CRM legată" },
    ...(context.customer_orders || []).map((item) => ({
      value: item.id,
      label: `${item.numar}${item.client ? ` — ${item.client}` : ""}`,
    })),
  ];
  const contractOptions = [
    { value: "", label: "Fără contract legat" },
    ...(context.contracts || []).map((item) => ({
      value: item.id,
      label: `${item.numar}${item.titlu ? ` — ${item.titlu}` : ""}`,
    })),
  ];

  function applyOrder(target, value) {
    const item = (context.orders || []).find(
      (order) => String(order.id) === String(value),
    );
    target((current) => ({
      ...current,
      comanda_id: value,
      comanda_numar: item?.numar || "",
      destinatar: current.destinatar || item?.partener || "",
    }));
  }
  function applyCustomerOrder(value) {
    const item = (context.customer_orders || []).find(
      (order) => String(order.id) === String(value),
    );
    setTripForm((current) => ({
      ...current,
      crm_comanda_id: value,
      crm_comanda_numar: item?.numar || "",
      crm_client: item?.client || "",
      destinatar: current.destinatar || item?.client || "",
    }));
  }
  function applyContract(target, value) {
    const item = (context.contracts || []).find(
      (contract) => String(contract.id) === String(value),
    );
    target((current) => ({
      ...current,
      contract_id: value,
      contract_numar: item?.numar || "",
    }));
  }
  function applyAsset(value) {
    const item = (context.assets || []).find(
      (asset) => String(asset.id) === String(value),
    );
    setPlanning(null);
    setTripForm((current) => ({
      ...current,
      vehicul_id: value,
      vehicul: item?.label || "",
    }));
  }
  function applyDriver(value) {
    const item = (context.drivers || []).find(
      (driver) => String(driver.id) === String(value),
    );
    setPlanning(null);
    setTripForm((current) => ({
      ...current,
      sofer_id: value,
      sofer: item?.label || "",
    }));
  }
  function applyTripToDocument(value) {
    const item = (context.trips || []).find(
      (trip) => String(trip.id) === String(value),
    );
    setDocumentForm((current) => ({
      ...current,
      cursa_id: value,
      cursa_numar: item?.numar || "",
      expeditor: item?.expeditor || current.expeditor,
      destinatar: item?.destinatar || current.destinatar,
      adresa_incarcare: item?.adresa_incarcare || current.adresa_incarcare,
      adresa_livrare: item?.adresa_livrare || current.adresa_livrare,
      transportator: item?.transportator || current.transportator,
      vehicul: item?.vehicul || current.vehicul,
      remorca: item?.remorca || current.remorca,
      sofer: item?.sofer || current.sofer,
      comanda_id: item?.comanda_id || current.comanda_id,
      comanda_numar: item?.comanda_numar || current.comanda_numar,
      crm_comanda_id: item?.crm_comanda_id || current.crm_comanda_id,
      crm_comanda_numar:
        item?.crm_comanda_numar || current.crm_comanda_numar,
      crm_client: item?.crm_client || current.crm_client,
      contract_id: item?.contract_id || current.contract_id,
      contract_numar: item?.contract_numar || current.contract_numar,
      linii: item?.linii?.length ? item.linii : current.linii,
    }));
  }
  function openTrip(item = null) {
    setEditingTrip(item);
    setTripForm(formFrom(item, initialTrip));
    setPlanning(item?.planning || null);
    setNotice("");
    setTripModal(true);
  }
  function openDocument(item = null, trip = null) {
    setEditingDocument(item);
    setDocumentForm(formFrom(item || trip, initialDocument));
    setNotice("");
    setDocumentModal(true);
    if (trip) setTimeout(() => applyTripToDocument(trip.id), 0);
  }
  function openEvidence(item) {
    setEvidenceTrip(item);
    setEvidenceFile(null);
    setDeliveryForm({
      primit_de: item.delivery_confirmation?.received_by || "",
      primit_la: String(
        item.delivery_confirmation?.received_at || new Date().toISOString(),
      ).slice(0, 16),
      observatii: item.delivery_confirmation?.note || "",
    });
    setEvidenceModal(true);
  }
  async function saveTrip(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...tripForm,
        linii: tripForm.linii.filter((line) => line.denumire || line.cantitate),
      };
      if (editingTrip)
        await api.patch(`/logistics/trips/${editingTrip.id}`, payload);
      else await api.post("/logistics/trips", payload);
      setTripModal(false);
      setNotice(
        editingTrip ? "Cursa a fost actualizată." : "Cursa a fost planificată.",
      );
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error || "Cursa nu a putut fi salvată.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function checkPlanning() {
    setSaving(true);
    setError("");
    try {
      const response = await api.post("/logistics/trips/planning-check", {
        ...tripForm,
        exclude_id: editingTrip?.id || "",
      });
      setPlanning(response.data?.planning || null);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Disponibilitatea nu a putut fi verificată.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveDocument(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...documentForm,
        linii: documentForm.linii.filter(
          (line) => line.denumire || line.cantitate,
        ),
      };
      if (editingDocument)
        await api.patch(`/logistics/documents/${editingDocument.id}`, payload);
      else await api.post("/logistics/documents", payload);
      setDocumentModal(false);
      setNotice(
        editingDocument
          ? "Documentul a fost actualizat."
          : "Documentul de transport a fost creat.",
      );
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Documentul nu a putut fi salvat.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancel(item, kind) {
    if (
      !window.confirm(
        `Anulezi ${kind === "trip" ? "cursa" : "documentul"} ${item.numar}? Istoricul rămâne păstrat.`,
      )
    )
      return;
    try {
      await api.post(
        `/logistics/${kind === "trip" ? "trips" : "documents"}/${item.id}/cancel`,
        { motiv: "Anulat din listă" },
      );
      setNotice("Anularea a fost înregistrată controlat.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Anularea nu a reușit.");
    }
  }
  function printDocument(item) {
    window.open(
      `/api/logistics/documents/${encodeURIComponent(item.id)}/print`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  async function confirmDelivery(event) {
    event.preventDefault();
    if (!evidenceTrip) return;
    setSaving(true);
    setError("");
    try {
      await api.post(
        `/logistics/trips/${evidenceTrip.id}/delivery-confirmation`,
        deliveryForm,
      );
      setNotice("Livrarea a fost confirmată și cursa este marcată Livrată.");
      await load();
      setEvidenceModal(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Livrarea nu a putut fi confirmată.",
      );
    } finally {
      setSaving(false);
    }
  }
  function openExecution(item, action) {
    setExecutionTrip(item);
    setExecutionAction(action);
    setExecutionForm({
      moment: new Date().toISOString().slice(0, 16),
      observatii: "",
    });
    setError("");
    setExecutionModal(true);
  }
  async function openStockPreparation(item) {
    setSaving(true);
    setError("");
    try {
      const response = await api.post(
        `/logistics/trips/${item.id}/stock-preparation/check`,
      );
      setStockPreparationTrip(item);
      setStockPreparation(response.data?.preparation || null);
      setStockPreparationNote("");
      setStockPreparationModal(true);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Stocul nu a putut fi verificat pentru această cursă.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function confirmStockPreparation() {
    if (!stockPreparationTrip) return;
    setSaving(true);
    setError("");
    try {
      await api.post(
        `/logistics/trips/${stockPreparationTrip.id}/stock-preparation/confirm`,
        { confirmare: true, observatii: stockPreparationNote },
      );
      setNotice(
        "Pregătirea pentru livrare a fost confirmată. Stocul nu a fost scăzut automat.",
      );
      setStockPreparationModal(false);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Pregătirea pentru livrare nu a putut fi confirmată.",
      );
    } finally {
      setSaving(false);
    }
  }
  function openEtransport(item) {
    setEtransportTrip(item);
    setEtransportForm({
      status: item.etransport?.status || "neanalizat",
      uit: item.etransport?.uit || "",
      referinta_interna: item.etransport?.referinta_interna || "",
      observatii: item.etransport?.observatii || "",
    });
    setError("");
    setEtransportModal(true);
  }
  async function saveEtransport(event) {
    event.preventDefault();
    if (!etransportTrip) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/logistics/trips/${etransportTrip.id}/etransport`, etransportForm);
      setNotice("Evidența RO e-Transport a fost salvată manual, fără transmitere către ANAF.");
      setEtransportModal(false);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Evidența RO e-Transport nu a putut fi salvată.",
      );
    } finally {
      setSaving(false);
    }
  }
  function openGpsAdapter(item) {
    setGpsAdapterTrip(item);
    setGpsAdapterForm({
      status: item.gps_adapter?.status || "neconectat",
      adaptor: item.gps_adapter?.adaptor || "",
      device_reference: item.gps_adapter?.device_reference || "",
      observatii: item.gps_adapter?.observatii || "",
    });
    setError("");
    setGpsAdapterModal(true);
  }
  async function saveGpsAdapter(event) {
    event.preventDefault();
    if (!gpsAdapterTrip) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`/logistics/trips/${gpsAdapterTrip.id}/gps-adapter`, gpsAdapterForm);
      setNotice("Legătura GPS/telematică a fost salvată. Nu s-au citit date live.");
      setGpsAdapterModal(false);
      await load();
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Legătura GPS nu a putut fi salvată.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function saveExecution(event) {
    event.preventDefault();
    if (!executionTrip) return;
    setSaving(true);
    setError("");
    try {
      const isStart = executionAction === "start";
      await api.post(
        `/logistics/trips/${executionTrip.id}/execution/${isStart ? "start" : "arrival"}`,
        isStart
          ? {
              plecare_efectiva: executionForm.moment,
              observatii: executionForm.observatii,
            }
          : {
              sosire_efectiva: executionForm.moment,
              observatii: executionForm.observatii,
            },
      );
      setNotice(
        isStart
          ? "Plecare efectivă înregistrată; cursa este În cursă."
          : "Sosire efectivă înregistrată; poți adăuga dovada de livrare.",
      );
      await load();
      setExecutionModal(false);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Momentul execuției nu a putut fi salvat.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function uploadEvidence() {
    if (!evidenceTrip || !evidenceFile) return;
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", evidenceFile);
      formData.append("categorie", "dovadă livrare");
      await api.post(
        `/logistics/trips/${evidenceTrip.id}/attachments`,
        formData,
      );
      setNotice("Dovada a fost încărcată controlat.");
      await load();
      setEvidenceFile(null);
      const refreshed = (await api.get("/logistics/trips")).data.trips?.find(
        (item) => item.id === evidenceTrip.id,
      );
      if (refreshed) setEvidenceTrip(refreshed);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Fișierul nu a putut fi încărcat.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function downloadEvidence(attachment) {
    try {
      const response = await api.get(attachment.download_url, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        attachment.original_name || attachment.file_name || "dovada-livrare";
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Fișierul nu a putut fi descărcat.",
      );
    }
  }

  const action =
    view === "trips" ? (
      <Button key="new-trip" onClick={() => openTrip()}>
        + Cursă nouă
      </Button>
    ) : (
      <Button key="new-document" onClick={() => openDocument()}>
        + Document transport
      </Button>
    );
  return (
    <div className="module-workspace logistics-workspace min-w-0 space-y-5">
      <PageHeader
        title="Logistică & Transport"
        subtitle="Planifică o cursă, alocă resursele, apoi creează și păstrează documentele de transport."
        actions={[action]}
      />
      <Card className="border-amber-200 bg-amber-50/60">
        <div className="text-sm text-amber-950">
          <b>Limită de etapă:</b> documentele se păstrează și se tipăresc local.
          Nu există transmitere automată către RO e-Transport, ANAF sau alt
          sistem extern; verificarea obligațiilor rămâne separată.
        </div>
      </Card>
      {notice ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </div>
      ) : null}
      <Card className="border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              Raport operațional
            </h2>
            <p className="text-sm text-slate-600">
              Situație locală a curselor, timpilor, costurilor introduse manual
              și excepțiilor de monitorizare.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={reportOpen ? "primary" : "secondary"}
              onClick={() => {
                const next = !reportOpen;
                setReportOpen(next);
                if (next && !report) loadReport();
              }}
            >
              {reportOpen ? "Ascunde raportul" : "Arată raportul"}
            </Button>
          </div>
        </div>
        {reportOpen ? (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="grid gap-3 md:grid-cols-[12rem_12rem_auto_auto]">
              <Input
                label="De la"
                type="date"
                value={reportFilters.from}
                onChange={(event) =>
                  setReportFilters((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
              />
              <Input
                label="Până la"
                type="date"
                value={reportFilters.to}
                onChange={(event) =>
                  setReportFilters((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
              />
              <div className="flex items-end">
                <Button
                  variant="secondary"
                  disabled={reportLoading}
                  onClick={() => loadReport()}
                >
                  {reportLoading ? "Se calculează…" : "Aplică intervalul"}
                </Button>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  disabled={reportLoading}
                  onClick={downloadReport}
                >
                  Export Excel
                </Button>
              </div>
            </div>
            {report ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ["Curse", report.summary.total_curse],
                    ["Livrate", report.summary.livrate],
                    ["În cursă", report.summary.in_cursa],
                    ["Întârzieri", report.summary.intarzieri],
                    ["Sosiri neconfirmate", report.summary.sosiri_neconfirmate],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="text-xl font-semibold text-slate-900">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="module-table-scroll min-w-0 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="ui-table min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Monedă</th>
                        <th className="px-3 py-2 text-right">Estimat</th>
                        <th className="px-3 py-2 text-right">Realizat</th>
                        <th className="px-3 py-2 text-right">Diferență</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.summary.costuri.length ? (
                        report.summary.costuri.map((cost) => (
                          <tr key={cost.moneda} className="border-t border-slate-100">
                            <td className="px-3 py-2">{cost.moneda}</td>
                            <td className="px-3 py-2 text-right">
                              {Number(cost.estimat).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(cost.realizat).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {Number(cost.diferenta).toFixed(2)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="px-3 py-4 text-center text-slate-500">
                            Nu există costuri în intervalul ales.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500">
                  Costurile sunt cele introduse manual pe cursă și rămân separate
                  pe monedă; raportul nu calculează TVA, cost/km sau înregistrări
                  contabile.
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </Card>
      <div className="flex gap-2 border-b border-slate-200">
        <Button
          size="sm"
          variant={view === "trips" ? "primary" : "ghost"}
          onClick={() => {
            setView("trips");
            setStatus("");
            setMonitoringFilter("");
          }}
        >
          Curse
        </Button>
        <Button
          size="sm"
          variant={view === "documents" ? "primary" : "ghost"}
          onClick={() => {
            setView("documents");
            setStatus("");
            setMonitoringFilter("");
          }}
        >
          Documente transport
        </Button>
      </div>
      {view === "trips" ? (
        <Card className="border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Monitorizare operațională</h2>
              <p className="text-sm text-slate-600">
                Semnalări calculate din intervalele și momentele introduse în InfraFlow. Nu generează notificări automate.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={monitoringFilter === "intarzieri" ? "primary" : "secondary"} onClick={() => setMonitoringFilter((current) => current === "intarzieri" ? "" : "intarzieri")}>
                Întârzieri: {monitoringSummary.intarzieri}
              </Button>
              <Button size="sm" variant={monitoringFilter === "livrari_neconfirmate" ? "primary" : "secondary"} onClick={() => setMonitoringFilter((current) => current === "livrari_neconfirmate" ? "" : "livrari_neconfirmate")}>
                Sosiri neconfirmate: {monitoringSummary.livrariNeconfirmate}
              </Button>
              {monitoringFilter ? <Button size="sm" variant="ghost" onClick={() => setMonitoringFilter("")}>Toate cursele</Button> : null}
            </div>
          </div>
        </Card>
      ) : null}
      <Card>
        <div className="grid gap-3 md:grid-cols-[1fr_14rem_auto]">
          <Input
            label="Caută"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              view === "trips"
                ? "Număr, expeditor, destinatar, vehicul"
                : "Număr, expeditor, destinatar, cursă"
            }
          />
          <Select
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            options={[
              { value: "", label: "Toate statusurile" },
              ...Object.entries(
                view === "trips" ? tripStatusLabels : documentStatusLabels,
              ).map(([value, label]) => ({ value, label })),
            ]}
          />
          <div className="flex items-end">
            <Button variant="secondary" onClick={load}>
              Reîncarcă
            </Button>
          </div>
        </div>
      </Card>
      {view === "trips" ? (
        <Card className="overflow-hidden p-0">
          <div className="module-table-scroll min-w-0 overflow-x-auto">
            <table className="ui-table min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Cursă</th>
                  <th className="px-4 py-3">Traseu</th>
                  <th className="px-4 py-3">Execuție</th>
                  <th className="px-4 py-3">Alocare</th>
                  <th className="px-4 py-3">Documente</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Se încarcă…
                    </td>
                  </tr>
                ) : visibleTrips.length ? (
                  visibleTrips.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <b>{item.numar}</b>
                        <div className="text-xs text-slate-500">
                          {item.data}
                          {item.comanda_numar
                            ? ` · Comandă ${item.comanda_numar}`
                            : ""}
                          {item.crm_comanda_numar
                            ? ` · Client ${item.crm_comanda_numar}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{item.expeditor}</div>
                        <div className="text-xs text-slate-500">
                          → {item.destinatar}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.plecare_efectiva ? (
                          <div>
                            Plecare: {String(item.plecare_efectiva).replace("T", " ").slice(0, 16)}
                          </div>
                        ) : (
                          <div className="text-slate-500">Neîncepută</div>
                        )}
                        {item.sosire_efectiva ? (
                          <div>
                            Sosire: {String(item.sosire_efectiva).replace("T", " ").slice(0, 16)}
                          </div>
                        ) : null}
                        {item.monitoring?.alerts?.map((alert) => (
                          <div
                            key={alert.code}
                            className={alert.level === "atentie" ? "mt-1 text-amber-700" : "mt-1 text-sky-700"}
                          >
                            {alert.label}
                          </div>
                        ))}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{item.vehicul || "Vehicul nealocat"}</div>
                        <div className="text-slate-500">
                          {item.sofer ||
                            item.transportator ||
                            "Șofer/transportator nealocat"}
                        </div>
                        {item.stock_preparation?.confirmat_la ? (
                          <div className="mt-1 text-emerald-700">
                            Pregătire stoc confirmată
                          </div>
                        ) : null}
                        {item.etransport?.status &&
                        item.etransport.status !== "neanalizat" ? (
                          <div className="mt-1 text-slate-600">
                            RO e-Transport: {item.etransport.status.replaceAll("_", " ")}
                          </div>
                        ) : null}
                        {item.gps_adapter?.status ===
                        "configurat_fara_date_live" ? (
                          <div className="mt-1 text-slate-600">
                            GPS/telematică configurat
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {item.documente_count
                          ? item.documente.map((document) => (
                              <div key={document.id}>{document.numar}</div>
                            ))
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusTone[item.status] || "default"}>
                          {item.status_label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {!item.plecare_efectiva && item.status !== "anulata" ? (
                            <Button size="sm" variant="secondary" onClick={() => openExecution(item, "start")}>
                              Plecare
                            </Button>
                          ) : null}
                          {item.plecare_efectiva && !item.sosire_efectiva && item.status !== "anulata" ? (
                            <Button size="sm" variant="secondary" onClick={() => openExecution(item, "arrival")}>
                              Sosire
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openDocument(null, item)}
                          >
                            Document
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEvidence(item)}
                          >
                            Dovadă
                          </Button>
                          {item.status !== "anulata" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openStockPreparation(item)}
                            >
                              Stoc
                            </Button>
                          ) : null}
                          {item.status !== "anulata" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openGpsAdapter(item)}
                            >
                              GPS
                            </Button>
                          ) : null}
                          {item.status !== "anulata" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEtransport(item)}
                            >
                              RO e-Transport
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openTrip(item)}
                          >
                            Editează
                          </Button>
                          {item.status !== "anulata" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(item, "trip")}
                            >
                              Anulează
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      Nu există curse pentru filtrul ales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="module-table-scroll min-w-0 overflow-x-auto">
            <table className="ui-table min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Traseu</th>
                  <th className="px-4 py-3">Legături</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      Se încarcă…
                    </td>
                  </tr>
                ) : visibleDocuments.length ? (
                  visibleDocuments.map((item) => (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <b>{item.numar}</b>
                        <div className="text-xs text-slate-500">
                          {item.tip_label} · {item.data}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{item.expeditor}</div>
                        <div className="text-xs text-slate-500">
                          → {item.destinatar}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>
                          {item.cursa_numar
                            ? `Cursă ${item.cursa_numar}`
                            : "Fără cursă"}
                        </div>
                        <div>
                          {item.comanda_numar
                            ? `Comandă ${item.comanda_numar}`
                            : item.contract_numar
                              ? `Contract ${item.contract_numar}`
                              : "—"}
                          {item.crm_comanda_numar ? (
                            <div className="text-slate-500">
                              Client {item.crm_comanda_numar}
                              {item.crm_client ? ` · ${item.crm_client}` : ""}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusTone[item.status] || "default"}>
                          {item.status_label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => printDocument(item)}
                          >
                            Tipărește
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDocument(item)}
                          >
                            Editează
                          </Button>
                          {item.status !== "anulat" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancel(item, "document")}
                            >
                              Anulează
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      Nu există documente pentru filtrul ales.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal
        open={tripModal}
        onClose={() => setTripModal(false)}
        title={
          editingTrip ? `Editează ${editingTrip.numar}` : "Planifică o cursă"
        }
        size="xl"
      >
        <form className="space-y-4" onSubmit={saveTrip}>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              label="Număr (automat dacă rămâne gol)"
              value={tripForm.numar}
              onChange={(event) => setTrip("numar", event.target.value)}
            />
            <Input
              label="Data"
              type="date"
              value={tripForm.data}
              onChange={(event) => setTrip("data", event.target.value)}
            />
            <Select
              label="Status"
              value={tripForm.status}
              onChange={(event) => setTrip("status", event.target.value)}
              options={Object.entries(tripStatusLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
            <Input
              label="Transportator"
              value={tripForm.transportator}
              onChange={(event) => setTrip("transportator", event.target.value)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Expeditor"
              required
              value={tripForm.expeditor}
              onChange={(event) => setTrip("expeditor", event.target.value)}
            />
            <Input
              label="Destinatar"
              required
              value={tripForm.destinatar}
              onChange={(event) => setTrip("destinatar", event.target.value)}
            />
            <Input
              label="Adresă încărcare"
              value={tripForm.adresa_incarcare}
              onChange={(event) =>
                setTrip("adresa_incarcare", event.target.value)
              }
            />
            <Input
              label="Adresă livrare"
              value={tripForm.adresa_livrare}
              onChange={(event) =>
                setTrip("adresa_livrare", event.target.value)
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              label="Plecare planificată"
              type="datetime-local"
              value={tripForm.plecare_planificata}
              onChange={(event) =>
                setTrip("plecare_planificata", event.target.value)
              }
            />
            <Input
              label="Sosire planificată"
              type="datetime-local"
              value={tripForm.sosire_planificata}
              onChange={(event) =>
                setTrip("sosire_planificata", event.target.value)
              }
            />
            <Select
              label="Vehicul"
              value={tripForm.vehicul_id}
              onChange={(event) => applyAsset(event.target.value)}
              options={[
                { value: "", label: "Vehicul nealocat" },
                ...(context.assets || []).map((item) => ({
                  value: item.id,
                  label: item.label,
                })),
              ]}
            />
            <Select
              label="Șofer"
              value={tripForm.sofer_id}
              onChange={(event) => applyDriver(event.target.value)}
              options={[
                { value: "", label: "Șofer nealocat" },
                ...(context.drivers || []).map((item) => ({
                  value: item.id,
                  label: item.label,
                })),
              ]}
            />
          </div>
          <section className="rounded-md border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Verificare planificare
                </h3>
                <p className="text-xs text-slate-500">
                  Compară doar intervalele curselor InfraFlow. Este o avertizare
                  pentru operator, nu blochează salvarea.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={saving}
                onClick={checkPlanning}
              >
                Verifică disponibilitatea
              </Button>
            </div>
            {planning ? (
              <div
                className={`mt-3 rounded p-3 text-sm ${planning.verdict === "atentie" ? "bg-amber-50 text-amber-950" : planning.verdict === "ok" ? "bg-emerald-50 text-emerald-950" : "bg-slate-50 text-slate-700"}`}
              >
                {planning.verdict === "ok"
                  ? "Nu există suprapuneri pentru resursele alocate."
                  : (planning.warnings || []).map((warning, index) => (
                      <div key={`${warning.code}-${index}`}>
                        {warning.message}
                      </div>
                    ))}
              </div>
            ) : null}
          </section>
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="Comandă aprovizionare"
              value={tripForm.comanda_id}
              onChange={(event) => applyOrder(setTripForm, event.target.value)}
              options={orderOptions}
            />
            <Select
              label="Comandă client CRM"
              value={tripForm.crm_comanda_id}
              onChange={(event) => applyCustomerOrder(event.target.value)}
              options={customerOrderOptions}
              disabled={!context.crm_orders_available}
            />
            <Select
              label="Contract"
              value={tripForm.contract_id}
              onChange={(event) =>
                applyContract(setTripForm, event.target.value)
              }
              options={contractOptions}
            />
            <Input
              label="Remorcă / observație vehicul"
              value={tripForm.remorca}
              onChange={(event) => setTrip("remorca", event.target.value)}
            />
          </div>
          <fieldset className="rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-800">
              Cost cursă (manual)
            </legend>
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                label="Cost estimat"
                type="number"
                min="0"
                step="0.01"
                value={tripForm.cost_estimat}
                onChange={(event) =>
                  setTrip("cost_estimat", event.target.value)
                }
              />
              <Input
                label="Cost realizat"
                type="number"
                min="0"
                step="0.01"
                value={tripForm.cost_real}
                onChange={(event) => setTrip("cost_real", event.target.value)}
              />
              <Select
                label="Monedă"
                value={tripForm.cost_moneda}
                onChange={(event) => setTrip("cost_moneda", event.target.value)}
                options={[
                  { value: "RON", label: "RON" },
                  { value: "EUR", label: "EUR" },
                ]}
              />
            </div>
            <label className="mt-3 grid gap-1 text-sm font-medium text-slate-700">
              Observații cost
              <textarea
                className="min-h-16 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
                value={tripForm.cost_observatii}
                onChange={(event) =>
                  setTrip("cost_observatii", event.target.value)
                }
              />
            </label>
          </fieldset>
          <LineEditor
            lines={tripForm.linii}
            onChange={(value) =>
              setTripForm((current) => ({ ...current, linii: value }))
            }
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații
            <textarea
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
              value={tripForm.observatii}
              onChange={(event) => setTrip("observatii", event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTripModal(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              Salvează cursa
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={documentModal}
        onClose={() => setDocumentModal(false)}
        title={
          editingDocument
            ? `Editează ${editingDocument.numar}`
            : "Document de transport nou"
        }
        size="xl"
      >
        <form className="space-y-4" onSubmit={saveDocument}>
          <div className="grid gap-3 md:grid-cols-4">
            <Select
              label="Tip"
              value={documentForm.tip}
              onChange={(event) => setDocument("tip", event.target.value)}
              options={Object.entries(typeLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Input
              label="Număr (automat dacă rămâne gol)"
              value={documentForm.numar}
              onChange={(event) => setDocument("numar", event.target.value)}
            />
            <Input
              label="Data"
              type="date"
              value={documentForm.data}
              onChange={(event) => setDocument("data", event.target.value)}
            />
            <Select
              label="Status"
              value={documentForm.status}
              onChange={(event) => setDocument("status", event.target.value)}
              options={Object.entries(documentStatusLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="Cursă (opțional)"
              value={documentForm.cursa_id}
              onChange={(event) => applyTripToDocument(event.target.value)}
              options={[
                { value: "", label: "Fără cursă legată" },
                ...(context.trips || []).map((item) => ({
                  value: item.id,
                  label: `${item.numar} — ${item.expeditor} → ${item.destinatar}`,
                })),
              ]}
            />
            <Select
              label="Comandă aprovizionare"
              value={documentForm.comanda_id}
              onChange={(event) =>
                applyOrder(setDocumentForm, event.target.value)
              }
              options={orderOptions}
            />
            <Select
              label="Contract"
              value={documentForm.contract_id}
              onChange={(event) =>
                applyContract(setDocumentForm, event.target.value)
              }
              options={contractOptions}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Expeditor"
              required
              value={documentForm.expeditor}
              onChange={(event) => setDocument("expeditor", event.target.value)}
            />
            <Input
              label="Destinatar"
              required
              value={documentForm.destinatar}
              onChange={(event) =>
                setDocument("destinatar", event.target.value)
              }
            />
            <Input
              label="Adresă încărcare"
              value={documentForm.adresa_incarcare}
              onChange={(event) =>
                setDocument("adresa_incarcare", event.target.value)
              }
            />
            <Input
              label="Adresă livrare"
              value={documentForm.adresa_livrare}
              onChange={(event) =>
                setDocument("adresa_livrare", event.target.value)
              }
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              label="Transportator"
              value={documentForm.transportator}
              onChange={(event) =>
                setDocument("transportator", event.target.value)
              }
            />
            <Input
              label="Vehicul"
              value={documentForm.vehicul}
              onChange={(event) => setDocument("vehicul", event.target.value)}
            />
            <Input
              label="Remorcă"
              value={documentForm.remorca}
              onChange={(event) => setDocument("remorca", event.target.value)}
            />
            <Input
              label="Șofer"
              value={documentForm.sofer}
              onChange={(event) => setDocument("sofer", event.target.value)}
            />
          </div>
          <Input
            label="Referință externă / CMR"
            value={documentForm.referinta_externa}
            onChange={(event) =>
              setDocument("referinta_externa", event.target.value)
            }
          />
          <LineEditor
            lines={documentForm.linii}
            onChange={(value) => setDocument("linii", value)}
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații
            <textarea
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
              value={documentForm.observatii}
              onChange={(event) =>
                setDocument("observatii", event.target.value)
              }
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDocumentModal(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              Salvează documentul
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={gpsAdapterModal}
        onClose={() => setGpsAdapterModal(false)}
        title={`GPS / telematică — ${gpsAdapterTrip?.numar || ""}`}
        size="md"
      >
        <form className="space-y-4" onSubmit={saveGpsAdapter}>
          <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            Acesta este un punct de legătură pentru un adaptor configurat
            explicit. Nu presupune un furnizor, nu păstrează credențiale și nu
            citește poziții sau trasee live.
          </p>
          <Select
            label="Stare adaptor"
            value={gpsAdapterForm.status}
            onChange={(event) =>
              setGpsAdapterForm((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
            options={gpsAdapterStatusOptions}
          />
          <Input
            label="Nume adaptor (opțional)"
            value={gpsAdapterForm.adaptor}
            placeholder="De exemplu: adaptor GPS configurat de organizație"
            onChange={(event) =>
              setGpsAdapterForm((current) => ({
                ...current,
                adaptor: event.target.value,
              }))
            }
          />
          <Input
            label="Identificator vehicul în sistemul GPS (opțional)"
            value={gpsAdapterForm.device_reference}
            onChange={(event) =>
              setGpsAdapterForm((current) => ({
                ...current,
                device_reference: event.target.value,
              }))
            }
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații
            <textarea
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
              value={gpsAdapterForm.observatii}
              onChange={(event) =>
                setGpsAdapterForm((current) => ({
                  ...current,
                  observatii: event.target.value,
                }))
              }
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setGpsAdapterModal(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              Salvează legătura
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={etransportModal}
        onClose={() => setEtransportModal(false)}
        title={`RO e-Transport — ${etransportTrip?.numar || ""}`}
        size="md"
      >
        <form className="space-y-4" onSubmit={saveEtransport}>
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Aceasta este numai evidență internă. Nu transmite date, nu generează
            UIT și nu verifică obligația legală de declarare. Înainte de orice
            declarare, verifică documentația oficială și lucrează în SPV/API
            doar cu credențialele autorizate.
          </p>
          <a
            className="text-sm font-medium text-emerald-800 underline"
            href="https://mfinante.gov.ro/ro/web/etransport"
            target="_blank"
            rel="noreferrer"
          >
            Deschide documentația oficială RO e-Transport
          </a>
          <Select
            label="Stare internă"
            value={etransportForm.status}
            onChange={(event) =>
              setEtransportForm((current) => ({
                ...current,
                status: event.target.value,
              }))
            }
            options={etransportStatusOptions}
          />
          <Input
            label="UIT (doar dacă l-ai primit)"
            value={etransportForm.uit}
            onChange={(event) =>
              setEtransportForm((current) => ({
                ...current,
                uit: event.target.value,
              }))
            }
          />
          <Input
            label="Referință internă (opțional)"
            value={etransportForm.referinta_interna}
            onChange={(event) =>
              setEtransportForm((current) => ({
                ...current,
                referinta_interna: event.target.value,
              }))
            }
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații
            <textarea
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
              value={etransportForm.observatii}
              onChange={(event) =>
                setEtransportForm((current) => ({
                  ...current,
                  observatii: event.target.value,
                }))
              }
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEtransportModal(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              Salvează evidența
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={stockPreparationModal}
        onClose={() => setStockPreparationModal(false)}
        title={`Pregătire pentru livrare — ${stockPreparationTrip?.numar || ""}`}
        size="lg"
      >
        <div className="space-y-4">
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Această etapă verifică pozițiile exact după denumirea din cursă și
            păstrează un snapshot al disponibilității. Nu rezervă și nu scade
            stocul; ieșirea din gestiune se înregistrează separat, controlat.
          </p>
          {stockPreparation ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-3">
                  <div className="text-xs text-slate-500">Poziții</div>
                  <div className="text-lg font-semibold">
                    {stockPreparation.total_linii}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-slate-500">Neidentificate</div>
                  <div className="text-lg font-semibold text-amber-700">
                    {stockPreparation.neidentificate}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-slate-500">Stoc insuficient</div>
                  <div className="text-lg font-semibold text-rose-700">
                    {stockPreparation.insuficiente}
                  </div>
                </Card>
              </div>
              <div className="module-table-scroll min-w-0 overflow-x-auto rounded-xl border border-slate-200">
                <table className="ui-table min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Poziție cursă</th>
                      <th className="px-3 py-2">Necesar</th>
                      <th className="px-3 py-2">Disponibil</th>
                      <th className="px-3 py-2">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stockPreparation.linii || []).map((line) => (
                      <tr key={line.line_id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div>{line.denumire || "Poziție fără denumire"}</div>
                          {line.material_denumire ? (
                            <div className="text-xs text-slate-500">
                              Material: {line.material_denumire}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {line.cantitate} {line.um}
                        </td>
                        <td className="px-3 py-2">
                          {line.disponibil === null
                            ? "—"
                            : `${line.disponibil} ${line.um}`}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              line.verdict === "disponibil"
                                ? "success"
                                : line.verdict === "insuficient"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {line.verdict === "disponibil"
                              ? "Disponibil"
                              : line.verdict === "insuficient"
                                ? "Insuficient"
                                : "Neidentificat"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Observații pregătire (opțional)
                <textarea
                  className="min-h-20 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
                  value={stockPreparationNote}
                  onChange={(event) => setStockPreparationNote(event.target.value)}
                />
              </label>
              {!stockPreparation.pregatibil ? (
                <p className="text-sm text-rose-700">
                  Corectează denumirile pozițiilor sau stocul în Gestiune înainte
                  de a confirma pregătirea.
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStockPreparationModal(false)}
                >
                  Închide
                </Button>
                <Button
                  type="button"
                  disabled={!stockPreparation.pregatibil}
                  loading={saving}
                  onClick={confirmStockPreparation}
                >
                  Confirmă pregătirea
                </Button>
              </div>
            </>
          ) : (
            <p className="text-slate-500">Nu există poziții de verificat.</p>
          )}
        </div>
      </Modal>
      <Modal
        open={evidenceModal}
        onClose={() => setEvidenceModal(false)}
        title={
          evidenceTrip
            ? `Dovadă livrare — ${evidenceTrip.numar}`
            : "Dovadă livrare"
        }
        size="lg"
      >
        <div className="space-y-5">
          <section className="rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-900">
              Confirmare de primire
            </h3>
            <form className="mt-3 space-y-3" onSubmit={confirmDelivery}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Primit de"
                  required
                  value={deliveryForm.primit_de}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      primit_de: event.target.value,
                    }))
                  }
                />
                <Input
                  label="Data și ora"
                  type="datetime-local"
                  value={deliveryForm.primit_la}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      primit_la: event.target.value,
                    }))
                  }
                />
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Observații
                <textarea
                  className="min-h-20 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
                  value={deliveryForm.observatii}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      observatii: event.target.value,
                    }))
                  }
                />
              </label>
              <Button type="submit" loading={saving}>
                Confirmă livrarea
              </Button>
            </form>
          </section>
          <section className="rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-900">
              Atașament: PDF sau fotografie
            </h3>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                <span>Fișier, maxim 20 MB</span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    setEvidenceFile(event.target.files?.[0] || null)
                  }
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={!evidenceFile}
                loading={saving}
                onClick={uploadEvidence}
              >
                Încarcă dovada
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {evidenceTrip?.attachments?.length ? (
                evidenceTrip.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded bg-slate-50 px-3 py-2"
                  >
                    <span className="truncate">{attachment.original_name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadEvidence(attachment)}
                    >
                      Descarcă
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">Nu există fișiere atașate.</p>
              )}
            </div>
          </section>
          <section className="rounded-md border border-slate-200 p-3">
            <h3 className="font-semibold text-slate-900">Legături cursă</h3>
            <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
              <div>
                <span className="text-slate-500">Comandă client:</span>{" "}
                {evidenceTrip?.traceability?.comanda_client?.numar || "—"}
                {evidenceTrip?.traceability?.comanda_client?.client
                  ? ` · ${evidenceTrip.traceability.comanda_client.client}`
                  : ""}
              </div>
              <div>
                <span className="text-slate-500">Comandă aprovizionare:</span>{" "}
                {evidenceTrip?.traceability?.comanda_aprovizionare?.numar ||
                  "—"}
              </div>
              <div>
                <span className="text-slate-500">Contract:</span>{" "}
                {evidenceTrip?.traceability?.contract?.numar || "—"}
              </div>
              <div>
                <span className="text-slate-500">Documente transport:</span>{" "}
                {evidenceTrip?.traceability?.documente?.length
                  ? evidenceTrip.traceability.documente
                      .map((document) => document.numar)
                      .join(", ")
                  : "—"}
              </div>
            </div>
          </section>
          <section>
            <h3 className="font-semibold text-slate-900">Istoric cursă</h3>
            <div className="mt-2 space-y-2 text-sm">
              {evidenceTrip?.timeline?.length ? (
                evidenceTrip.timeline.map((event) => (
                  <div
                    key={event.id}
                    className="border-l-2 border-slate-200 pl-3"
                  >
                    <div>{event.label}</div>
                    <div className="text-xs text-slate-500">
                      {String(event.at || "")
                        .replace("T", " ")
                        .slice(0, 16)}
                      {event.user_name ? ` · ${event.user_name}` : ""}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">
                  Istoricul va apărea după prima acțiune.
                </p>
              )}
            </div>
          </section>
        </div>
      </Modal>
      <Modal
        open={executionModal}
        onClose={() => setExecutionModal(false)}
        title={
          executionAction === "start"
            ? `Plecare efectivă — ${executionTrip?.numar || ""}`
            : `Sosire efectivă — ${executionTrip?.numar || ""}`
        }
        size="md"
      >
        <form className="space-y-4" onSubmit={saveExecution}>
          <p className="text-sm text-slate-600">
            Momentul este introdus manual și rămâne în istoricul cursei. Nu provine din GPS sau din alt sistem extern.
          </p>
          <Input
            label={executionAction === "start" ? "Data și ora plecării efective" : "Data și ora sosirii efective"}
            type="datetime-local"
            required
            value={executionForm.moment}
            onChange={(event) => setExecutionForm((current) => ({ ...current, moment: event.target.value }))}
          />
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Observații execuție
            <textarea
              className="min-h-24 rounded-[var(--radius-control)] border border-slate-300 p-2 text-sm"
              value={executionForm.observatii}
              onChange={(event) => setExecutionForm((current) => ({ ...current, observatii: event.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setExecutionModal(false)}>
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              {executionAction === "start" ? "Înregistrează plecarea" : "Înregistrează sosirea"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
