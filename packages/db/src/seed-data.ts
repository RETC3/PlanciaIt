// Demo data for `pnpm db:seed`: a fictitious mid-sized company with a head
// office, a branch and the usual infrastructure. Names and addresses are made up.

type AssetStatus = 'in_use' | 'in_stock' | 'maintenance' | 'retired';
type RelationKind =
  'depends_on' | 'runs_on' | 'located_in' | 'backed_up_to' | 'connected_to' | 'related_to';

export interface SeedArea {
  key: string;
  name: string;
  description: string;
}

export interface SeedTechnician {
  username: string;
  displayName: string;
  areas: Partial<Record<string, 'read' | 'write'>>;
}

export interface SeedAssetType {
  name: string;
  description: string;
  /** Same definitions as the defaults of migration 0004, used if the type is missing. */
  fields: unknown[];
}

export interface SeedAsset {
  name: string;
  area: string;
  type: string;
  status?: AssetStatus;
  hostname?: string;
  ipAddress?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  notes?: string;
  /** Values whose key is missing from the (possibly edited) type are skipped. */
  customFields?: Record<string, string | number | boolean>;
}

export interface SeedRelation {
  source: string;
  kind: RelationKind;
  target: string;
  note?: string;
}

export const seedAreas: SeedArea[] = [
  {
    key: 'hq',
    name: 'Sede di Milano',
    description: 'Server, virtualizzazione e servizi della sede principale.',
  },
  {
    key: 'network',
    name: 'Rete',
    description: 'Firewall, switch, access point e connettività WAN.',
  },
  {
    key: 'branch',
    name: 'Filiale di Torino',
    description: 'Infrastruttura locale della filiale, collegata alla sede via VPN.',
  },
  {
    key: 'backup',
    name: 'Backup e storage',
    description: 'NAS di backup, SAN e copie fuori sede.',
  },
];

export const seedTechnicians: SeedTechnician[] = [
  {
    username: 'luca.bianchi',
    displayName: 'Luca Bianchi',
    areas: { network: 'write', hq: 'read', branch: 'read' },
  },
  {
    username: 'giulia.verdi',
    displayName: 'Giulia Verdi',
    areas: { branch: 'write', network: 'read' },
  },
  {
    username: 'andrea.neri',
    displayName: 'Andrea Neri',
    areas: { backup: 'write', hq: 'read' },
  },
];

export const seedAssetTypes: SeedAssetType[] = [
  {
    name: 'Server',
    description: 'Server fisici e macchine virtuali',
    fields: [
      { key: 'operating_system', label: 'Sistema operativo', kind: 'text', required: false },
      { key: 'role', label: 'Ruolo', kind: 'text', required: false },
      { key: 'virtual', label: 'Macchina virtuale', kind: 'boolean', required: false },
    ],
  },
  {
    name: 'Dispositivo di rete',
    description: 'Switch, router, firewall e access point',
    fields: [
      {
        key: 'device_kind',
        label: 'Tipo di dispositivo',
        kind: 'select',
        required: false,
        options: ['Switch', 'Router', 'Firewall', 'Access point', 'Altro'],
      },
      { key: 'firmware', label: 'Versione firmware', kind: 'text', required: false },
    ],
  },
  {
    name: 'Storage',
    description: 'NAS, SAN e unità di backup',
    fields: [{ key: 'capacity_tb', label: 'Capacità (TB)', kind: 'number', required: false }],
  },
  { name: 'Stampante', description: 'Stampanti e multifunzione', fields: [] },
  { name: 'Altro', description: 'Tutto ciò che non rientra negli altri tipi', fields: [] },
];

const vm = (operatingSystem: string, role: string) => ({
  operating_system: operatingSystem,
  role,
  virtual: true,
});

export const seedAssets: SeedAsset[] = [
  // Head office: virtualization hosts and virtual machines.
  {
    name: 'esx-01',
    area: 'hq',
    type: 'Server',
    hostname: 'esx-01.azienda.local',
    ipAddress: '10.10.0.11',
    serialNumber: 'CZJ4120A7K',
    manufacturer: 'HPE',
    model: 'ProLiant DL380 Gen11',
    location: 'CED piano -1, rack A, U10-11',
    customFields: {
      operating_system: 'VMware ESXi 8.0 U3',
      role: 'Host di virtualizzazione',
      virtual: false,
    },
  },
  {
    name: 'esx-02',
    area: 'hq',
    type: 'Server',
    hostname: 'esx-02.azienda.local',
    ipAddress: '10.10.0.12',
    serialNumber: 'CZJ4120A9P',
    manufacturer: 'HPE',
    model: 'ProLiant DL380 Gen11',
    location: 'CED piano -1, rack A, U12-13',
    customFields: {
      operating_system: 'VMware ESXi 8.0 U3',
      role: 'Host di virtualizzazione',
      virtual: false,
    },
  },
  {
    name: 'srv-dc01',
    area: 'hq',
    type: 'Server',
    hostname: 'dc01.azienda.local',
    ipAddress: '10.10.1.10',
    customFields: vm('Windows Server 2025', 'Domain controller, DNS, DHCP'),
  },
  {
    name: 'srv-dc02',
    area: 'hq',
    type: 'Server',
    hostname: 'dc02.azienda.local',
    ipAddress: '10.10.1.11',
    customFields: vm('Windows Server 2025', 'Domain controller secondario, DNS'),
  },
  {
    name: 'srv-files01',
    area: 'hq',
    type: 'Server',
    hostname: 'files01.azienda.local',
    ipAddress: '10.10.1.20',
    notes: 'Condivisioni di reparto. Quote per utente attive dal 2025.',
    customFields: vm('Windows Server 2022', 'File server'),
  },
  {
    name: 'srv-erp01',
    area: 'hq',
    type: 'Server',
    hostname: 'erp01.azienda.local',
    ipAddress: '10.10.1.30',
    notes: 'Gestionale contabilità e magazzino. Assistenza del fornitore il martedì.',
    customFields: vm('Windows Server 2022', 'Application server ERP'),
  },
  {
    name: 'srv-db01',
    area: 'hq',
    type: 'Server',
    hostname: 'db01.azienda.local',
    ipAddress: '10.10.1.31',
    customFields: vm('Windows Server 2022', 'SQL Server 2022'),
  },
  {
    name: 'srv-web01',
    area: 'hq',
    type: 'Server',
    hostname: 'intranet.azienda.local',
    ipAddress: '10.10.1.40',
    customFields: vm('Ubuntu Server 24.04 LTS', 'Intranet aziendale'),
  },
  {
    name: 'srv-print01',
    area: 'hq',
    type: 'Server',
    hostname: 'print01.azienda.local',
    ipAddress: '10.10.1.50',
    status: 'maintenance',
    notes: 'Driver delle multifunzione in aggiornamento.',
    customFields: vm('Windows Server 2022', 'Print server'),
  },
  {
    name: 'srv-dc-old',
    area: 'hq',
    type: 'Server',
    hostname: 'dc-old.azienda.local',
    status: 'retired',
    serialNumber: 'CZ3712B0QX',
    manufacturer: 'HPE',
    model: 'ProLiant DL360 Gen9',
    notes: 'Vecchio domain controller fisico, dismesso dopo la migrazione a Windows Server 2025.',
    customFields: { operating_system: 'Windows Server 2016', virtual: false },
  },
  {
    name: 'prn-amministrazione',
    area: 'hq',
    type: 'Stampante',
    ipAddress: '10.10.5.21',
    serialNumber: 'VCF3Z12345',
    manufacturer: 'Kyocera',
    model: 'TASKalfa 3554ci',
    location: 'Piano 1, ufficio amministrazione',
  },
  {
    name: 'prn-ufficio-tecnico',
    area: 'hq',
    type: 'Stampante',
    ipAddress: '10.10.5.22',
    serialNumber: 'E78231K9N',
    manufacturer: 'Brother',
    model: 'MFC-L8900CDW',
    location: 'Piano 2, ufficio tecnico',
  },
  {
    name: 'rack-ced-a',
    area: 'hq',
    type: 'Altro',
    manufacturer: 'APC',
    model: 'NetShelter SX 42U',
    location: 'CED piano -1',
    notes: 'Armadio principale del CED, con UPS da 6 kVA.',
  },

  // Network.
  {
    name: 'fw-01',
    area: 'network',
    type: 'Dispositivo di rete',
    hostname: 'fw-01.azienda.local',
    ipAddress: '10.10.0.1',
    serialNumber: 'FGT60FTK21001234',
    manufacturer: 'Fortinet',
    model: 'FortiGate 100F',
    location: 'CED piano -1, rack A, U42',
    customFields: { device_kind: 'Firewall', firmware: 'FortiOS 7.4.5' },
  },
  {
    name: 'rtr-wan-01',
    area: 'network',
    type: 'Dispositivo di rete',
    ipAddress: '10.10.0.254',
    manufacturer: 'Cisco',
    model: 'ISR 1111',
    location: 'CED piano -1, rack A, U41',
    notes: 'Fibra 1 Gbit/s simmetrica, linea di backup FWA.',
    customFields: { device_kind: 'Router', firmware: 'IOS XE 17.9' },
  },
  {
    name: 'sw-core-01',
    area: 'network',
    type: 'Dispositivo di rete',
    hostname: 'sw-core-01.azienda.local',
    ipAddress: '10.10.0.2',
    serialNumber: 'FOC2539X1AB',
    manufacturer: 'Cisco',
    model: 'Catalyst 9300-48P',
    location: 'CED piano -1, rack A, U40',
    customFields: { device_kind: 'Switch', firmware: 'IOS XE 17.12' },
  },
  {
    name: 'sw-piano1',
    area: 'network',
    type: 'Dispositivo di rete',
    ipAddress: '10.10.0.3',
    manufacturer: 'Cisco',
    model: 'Catalyst 9200-24P',
    location: 'Piano 1, armadio di piano',
    customFields: { device_kind: 'Switch', firmware: 'IOS XE 17.12' },
  },
  {
    name: 'sw-piano2',
    area: 'network',
    type: 'Dispositivo di rete',
    ipAddress: '10.10.0.4',
    manufacturer: 'Cisco',
    model: 'Catalyst 9200-24P',
    location: 'Piano 2, armadio di piano',
    customFields: { device_kind: 'Switch', firmware: 'IOS XE 17.9' },
  },
  {
    name: 'sw-scorta',
    area: 'network',
    type: 'Dispositivo di rete',
    status: 'in_stock',
    manufacturer: 'Cisco',
    model: 'Catalyst 9200-24P',
    location: 'Magazzino IT',
    notes: 'Switch di scorta, configurazione base già caricata.',
    customFields: { device_kind: 'Switch' },
  },
  {
    name: 'ap-piano1',
    area: 'network',
    type: 'Dispositivo di rete',
    ipAddress: '10.10.0.21',
    manufacturer: 'Ubiquiti',
    model: 'U7 Pro',
    location: 'Piano 1, corridoio',
    customFields: { device_kind: 'Access point', firmware: '7.0.66' },
  },
  {
    name: 'ap-piano2',
    area: 'network',
    type: 'Dispositivo di rete',
    ipAddress: '10.10.0.22',
    manufacturer: 'Ubiquiti',
    model: 'U7 Pro',
    location: 'Piano 2, sala riunioni',
    customFields: { device_kind: 'Access point', firmware: '7.0.66' },
  },

  // Branch office.
  {
    name: 'fw-to-01',
    area: 'branch',
    type: 'Dispositivo di rete',
    ipAddress: '10.20.0.1',
    serialNumber: 'FGT40FTK22005678',
    manufacturer: 'Fortinet',
    model: 'FortiGate 40F',
    location: 'Torino, locale tecnico',
    customFields: { device_kind: 'Firewall', firmware: 'FortiOS 7.4.5' },
  },
  {
    name: 'sw-to-01',
    area: 'branch',
    type: 'Dispositivo di rete',
    ipAddress: '10.20.0.2',
    manufacturer: 'Cisco',
    model: 'CBS350-24P',
    location: 'Torino, locale tecnico',
    customFields: { device_kind: 'Switch', firmware: '3.4.1' },
  },
  {
    name: 'ap-to-01',
    area: 'branch',
    type: 'Dispositivo di rete',
    ipAddress: '10.20.0.21',
    manufacturer: 'Ubiquiti',
    model: 'U6+',
    location: 'Torino, open space',
    customFields: { device_kind: 'Access point', firmware: '6.6.77' },
  },
  {
    name: 'nas-to-01',
    area: 'branch',
    type: 'Storage',
    hostname: 'nas-to-01.azienda.local',
    ipAddress: '10.20.0.10',
    serialNumber: '2280Q7RAB123',
    manufacturer: 'Synology',
    model: 'DS923+',
    location: 'Torino, locale tecnico',
    notes: 'Cartelle condivise della filiale, sincronizzate ogni notte con la sede.',
    customFields: { capacity_tb: 16 },
  },
  {
    name: 'prn-torino',
    area: 'branch',
    type: 'Stampante',
    ipAddress: '10.20.5.21',
    manufacturer: 'Kyocera',
    model: 'ECOSYS M5526cdw',
    location: 'Torino, ingresso',
  },

  // Backup and storage.
  {
    name: 'san-01',
    area: 'backup',
    type: 'Storage',
    ipAddress: '10.10.0.30',
    serialNumber: 'SGH412XYZ9',
    manufacturer: 'HPE',
    model: 'MSA 2060',
    location: 'CED piano -1, rack A, U20-21',
    customFields: { capacity_tb: 40 },
  },
  {
    name: 'nas-backup01',
    area: 'backup',
    type: 'Storage',
    hostname: 'nas-backup01.azienda.local',
    ipAddress: '10.10.0.40',
    serialNumber: '22A0QWERT456',
    manufacturer: 'Synology',
    model: 'RS2423+',
    location: 'CED piano -1, rack A, U5-6',
    notes: 'Backup giornalieri delle VM, conservazione 30 giorni.',
    customFields: { capacity_tb: 48 },
  },
  {
    name: 'nas-backup02',
    area: 'backup',
    type: 'Storage',
    hostname: 'nas-backup02.azienda.local',
    ipAddress: '10.20.0.40',
    manufacturer: 'QNAP',
    model: 'TS-873A',
    location: 'Torino, locale tecnico',
    notes: 'Copia fuori sede di nas-backup01, replica settimanale.',
    customFields: { capacity_tb: 32 },
  },
];

export const seedRelations: SeedRelation[] = [
  { source: 'srv-dc01', kind: 'runs_on', target: 'esx-01' },
  { source: 'srv-files01', kind: 'runs_on', target: 'esx-01' },
  { source: 'srv-web01', kind: 'runs_on', target: 'esx-01' },
  { source: 'srv-print01', kind: 'runs_on', target: 'esx-01' },
  { source: 'srv-dc02', kind: 'runs_on', target: 'esx-02' },
  { source: 'srv-erp01', kind: 'runs_on', target: 'esx-02' },
  { source: 'srv-db01', kind: 'runs_on', target: 'esx-02' },

  { source: 'srv-erp01', kind: 'depends_on', target: 'srv-db01' },
  { source: 'srv-web01', kind: 'depends_on', target: 'srv-db01' },
  {
    source: 'srv-files01',
    kind: 'depends_on',
    target: 'srv-dc01',
    note: 'Autenticazione e permessi NTFS',
  },
  { source: 'esx-01', kind: 'depends_on', target: 'san-01', note: 'Datastore iSCSI' },
  { source: 'esx-02', kind: 'depends_on', target: 'san-01', note: 'Datastore iSCSI' },
  { source: 'prn-amministrazione', kind: 'depends_on', target: 'srv-print01' },
  { source: 'prn-ufficio-tecnico', kind: 'depends_on', target: 'srv-print01' },

  { source: 'esx-01', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'esx-02', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'san-01', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'nas-backup01', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'fw-01', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'rtr-wan-01', kind: 'located_in', target: 'rack-ced-a' },
  { source: 'sw-core-01', kind: 'located_in', target: 'rack-ced-a' },

  { source: 'rtr-wan-01', kind: 'connected_to', target: 'fw-01' },
  { source: 'fw-01', kind: 'connected_to', target: 'sw-core-01' },
  {
    source: 'sw-piano1',
    kind: 'connected_to',
    target: 'sw-core-01',
    note: 'Uplink in fibra 10 Gbit/s',
  },
  {
    source: 'sw-piano2',
    kind: 'connected_to',
    target: 'sw-core-01',
    note: 'Uplink in fibra 10 Gbit/s',
  },
  { source: 'ap-piano1', kind: 'connected_to', target: 'sw-piano1' },
  { source: 'ap-piano2', kind: 'connected_to', target: 'sw-piano2' },
  { source: 'esx-01', kind: 'connected_to', target: 'sw-core-01' },
  { source: 'esx-02', kind: 'connected_to', target: 'sw-core-01' },
  { source: 'fw-to-01', kind: 'connected_to', target: 'fw-01', note: 'VPN IPsec site-to-site' },
  { source: 'sw-to-01', kind: 'connected_to', target: 'fw-to-01' },
  { source: 'ap-to-01', kind: 'connected_to', target: 'sw-to-01' },

  { source: 'srv-files01', kind: 'backed_up_to', target: 'nas-backup01' },
  { source: 'srv-erp01', kind: 'backed_up_to', target: 'nas-backup01' },
  { source: 'srv-db01', kind: 'backed_up_to', target: 'nas-backup01', note: 'Dump SQL ogni 4 ore' },
  { source: 'srv-dc01', kind: 'backed_up_to', target: 'nas-backup01' },
  {
    source: 'nas-backup01',
    kind: 'backed_up_to',
    target: 'nas-backup02',
    note: 'Copia fuori sede',
  },
  { source: 'nas-to-01', kind: 'backed_up_to', target: 'nas-backup02' },

  {
    source: 'sw-scorta',
    kind: 'related_to',
    target: 'sw-piano1',
    note: 'Sostituto in caso di guasto',
  },
];
