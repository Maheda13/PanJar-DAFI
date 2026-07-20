// ====================== CONFIG ======================
// Tempel URL Web App Apps Script kamu di sini (Deploy > New deployment > Web app)
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzBrKQ7EG352TYGKJvhYY53YqyCM6pnAHuGXUf6XIePMnK6dFv-qP6hR7jPhrg7r8s/exec'
};

const SEMESTER_OPTIONS = ['Ganjil', 'Genap'];
const KATEGORI_CATATAN = ['Akademik', 'Perilaku', 'Prestasi', 'Lainnya'];

// ====================== API CLIENT ======================
async function api(action, data = {}, method = 'GET') {
  if (!CONFIG.GAS_URL || CONFIG.GAS_URL.includes('PASTE_URL')) {
    document.getElementById('configBanner').classList.add('show');
    throw new Error('GAS_URL belum dikonfigurasi. Lihat README.');
  }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(CONFIG.GAS_URL.trim())) {
    throw new Error('Format GAS_URL tampak salah. URL harus diakhiri "/exec" (bukan "/dev"), disalin dari Deploy > Manage deployments di Apps Script.');
  }

  let res;
  try {
    if (method === 'GET') {
      const qs = new URLSearchParams({ action, ...data }).toString();
      res = await fetch(`${CONFIG.GAS_URL}?${qs}`);
    } else {
      res = await fetch(CONFIG.GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data })
      });
    }
  } catch (networkErr) {
    // "Failed to fetch" muncul di sini — hampir selalu bukan bug kode,
    // tapi deployment Apps Script yang belum bisa diakses dari luar.
    throw new Error(
      'Gagal menghubungi server (Failed to fetch). Kemungkinan penyebab: ' +
      '(1) deployment Apps Script belum di-set "Who has access: Anyone", ' +
      '(2) URL yang dipakai masih versi "/dev" bukan "/exec", atau ' +
      '(3) belum redeploy versi baru setelah mengubah Code.gs. Lihat README bagian Setup.'
    );
  }

  if (!res.ok) {
    throw new Error(`Server merespons dengan error (HTTP ${res.status}). Coba redeploy Apps Script sebagai versi baru.`);
  }

  let json;
  try {
    json = await res.json();
  } catch (parseErr) {
    throw new Error('Respons server tidak berupa JSON yang valid. Pastikan doGet/doPost di Code.gs mengembalikan ContentService JSON, dan deployment sudah versi terbaru.');
  }

  if (!json.success) throw new Error(json.error || 'Terjadi kesalahan pada server');
  return json.data;
}

// ====================== STATE ======================
const state = {
  page: 'dashboard',
  kelasList: [],
  siswaList: [],
  jenisDokumen: []
};

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => el.classList.remove('show'), 3200);
}

// ====================== NAVIGATION ======================
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => goTo(tab.dataset.page));
});

async function goTo(page) {
  state.page = page;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  const content = document.getElementById('pageContent');
  content.innerHTML = `<div class="empty-state"><span class="loading-spinner"></span></div>`;
  try {
    if (!state.kelasList.length) state.kelasList = await api('getKelas').catch(() => []);
    switch (page) {
      case 'dashboard': await renderDashboard(); break;
      case 'dokumen': await renderDokumen(); break;
      case 'absensi': await renderAbsensi(); break;
      case 'nilai': await renderNilai(); break;
      case 'catatan': await renderCatatan(); break;
      case 'kelas': await renderKelas(); break;
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><div class="display">Belum bisa memuat data</div><div>${esc(err.message)}</div></div>`;
  }
}

function kelasOptions(selected, includeSemua) {
  let opts = '';
  if (includeSemua) opts += `<option value="Semua Kelas" ${selected === 'Semua Kelas' ? 'selected' : ''}>Semua Kelas</option>`;
  state.kelasList.forEach(k => {
    opts += `<option value="${esc(k['Nama Kelas'])}" ${selected === k['Nama Kelas'] ? 'selected' : ''}>${esc(k['Nama Kelas'])}</option>`;
  });
  return opts;
}

// ====================== MODAL HELPER ======================
function openModal(title, bodyHtml, onSubmit, submitLabel = 'Simpan') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal">
        <h2>${esc(title)}</h2>
        <form id="modalForm">${bodyHtml}
          <div class="modal-actions">
            <button type="button" class="btn" id="modalCancel">Batal</button>
            <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>`;
  const overlay = document.getElementById('modalOverlay');
  const close = () => root.innerHTML = '';
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.getElementById('modalCancel').addEventListener('click', close);
  document.getElementById('modalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
    try {
      await onSubmit(data);
      close();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
      btn.textContent = submitLabel;
    }
  });
  return close;
}

// ====================== DASHBOARD ======================
async function renderDashboard() {
  const d = await api('getDashboard');
  const pct = d.persenSelesai;
  const stampClass = pct >= 70 ? '' : pct >= 35 ? 'warn' : 'low';
  const rekap = d.rekapAbsensiHariIni;

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <div class="subtitle">Ringkasan progres administrasi pembelajaran</div>
      </div>
    </div>

    <div class="card hero-card" style="margin-bottom:20px;">
      <div class="stamp ${stampClass}">
        <div class="pct">${pct}%</div>
        <div class="cap">selesai</div>
      </div>
      <div class="hero-text">
        <h2>Progres Dokumen Pembelajaran</h2>
        <p>${d.statusCount.Selesai} dari ${d.totalDokumen} dokumen sudah rampung &middot;
        ${d.statusCount.Proses} sedang dikerjakan &middot; ${d.statusCount.Belum} belum dimulai.</p>
      </div>
    </div>

    <div class="grid grid-4">
      <div class="card stat-card">
        <div class="label">Total Kelas</div>
        <div class="value">${d.totalKelas}</div>
      </div>
      <div class="card stat-card">
        <div class="label">Total Siswa</div>
        <div class="value">${d.totalSiswa}</div>
      </div>
      <div class="card stat-card">
        <div class="label">Dokumen Selesai</div>
        <div class="value">${d.statusCount.Selesai}<span class="mono" style="font-size:16px;color:var(--ink-soft)">/${d.totalDokumen}</span></div>
      </div>
      <div class="card stat-card">
        <div class="label">Absensi Hari Ini</div>
        <div class="value" style="font-size:20px;">${d.sudahAbsenHariIni ? 'Tercatat' : 'Belum diisi'}</div>
        <div class="hint">${rekap.Hadir} hadir &middot; ${rekap.Sakit} sakit &middot; ${rekap.Izin} izin &middot; ${rekap.Alpa} alpa</div>
      </div>
    </div>

    <div class="section-label">Status per Kategori</div>
    <div class="grid grid-3">
      <div class="card"><span class="badge Belum">Belum</span><div class="value" style="font-family:'Zilla Slab',serif;font-size:26px;margin-top:10px;">${d.statusCount.Belum}</div></div>
      <div class="card"><span class="badge Proses">Proses</span><div class="value" style="font-family:'Zilla Slab',serif;font-size:26px;margin-top:10px;">${d.statusCount.Proses}</div></div>
      <div class="card"><span class="badge Selesai">Selesai</span><div class="value" style="font-family:'Zilla Slab',serif;font-size:26px;margin-top:10px;">${d.statusCount.Selesai}</div></div>
    </div>
  `;
}

// ====================== DOKUMEN ======================
async function renderDokumen() {
  if (!state.jenisDokumen.length) state.jenisDokumen = await api('getJenisDokumen');
  const kelasFilter = window.__dokKelas || '';
  const list = await api('getDokumen', kelasFilter ? { kelas: kelasFilter } : {});

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><h1>Dokumen Pembelajaran</h1><div class="subtitle">Kalender akademik, RME, Prota, Promes, modul ajar, naskah soal, LKPD</div></div>
      <button class="btn btn-primary" id="btnAddDok">+ Tambah Dokumen</button>
    </div>
    <div class="toolbar">
      <select id="filterKelas" class="filter-select">
        <option value="">Semua Kelas</option>
        ${kelasOptions(kelasFilter, false)}
      </select>
    </div>
    <div class="card" style="padding:0;">
      ${list.length ? `<table><thead><tr>
        <th>Jenis</th><th>Kelas</th><th>Semester</th><th>Th. Ajaran</th><th>Status</th><th>Update</th><th></th>
      </tr></thead><tbody>
        ${list.map(d => `<tr>
          <td>${esc(d.Jenis)}${d.Link ? ` &middot; <a href="${esc(d.Link)}" target="_blank" rel="noopener">tautan</a>` : ''}</td>
          <td>${esc(d.Kelas)}</td>
          <td>${esc(d.Semester)}</td>
          <td class="mono">${esc(d['Tahun Ajaran'])}</td>
          <td><span class="badge ${esc(d.Status)}">${esc(d.Status)}</span></td>
          <td class="mono">${esc(d['Tanggal Update'])}</td>
          <td><button class="btn btn-sm" data-edit-dok="${esc(d.ID)}">Ubah</button></td>
        </tr>`).join('')}
      </tbody></table>` : `<div class="empty-state"><div class="display">Belum ada dokumen</div>Klik "Tambah Dokumen" untuk mulai mencatat progres.</div>`}
    </div>
  `;

  document.getElementById('filterKelas').addEventListener('change', e => { window.__dokKelas = e.target.value; renderDokumen(); });
  document.getElementById('btnAddDok').addEventListener('click', () => dokumenModal());
  document.querySelectorAll('[data-edit-dok]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = list.find(d => d.ID === btn.dataset.editDok);
      dokumenModal(item);
    });
  });
}

function dokumenModal(item) {
  const isEdit = !!item;
  const body = `
    <div class="field">
      <label>Jenis Dokumen</label>
      <select name="Jenis" required>
        ${state.jenisDokumen.map(j => `<option value="${esc(j)}" ${item && item.Jenis === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Kelas</label>
        <select name="Kelas" required>${kelasOptions(item ? item.Kelas : '', true)}</select>
      </div>
      <div class="field">
        <label>Semester</label>
        <select name="Semester" required>
          ${SEMESTER_OPTIONS.map(s => `<option ${item && item.Semester === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Tahun Ajaran</label>
        <input name="Tahun Ajaran" placeholder="2025/2026" value="${item ? esc(item['Tahun Ajaran']) : ''}" required>
      </div>
      <div class="field">
        <label>Status</label>
        <select name="Status" required>
          ${STATUS_OPTS().map(s => `<option ${item && item.Status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field">
      <label>Tautan Dokumen (opsional)</label>
      <input name="Link" type="url" placeholder="https://drive.google.com/..." value="${item ? esc(item.Link) : ''}">
    </div>
    <div class="field">
      <label>Catatan (opsional)</label>
      <textarea name="Catatan" rows="2">${item ? esc(item.Catatan) : ''}</textarea>
    </div>
    ${isEdit ? `<button type="button" class="btn btn-danger btn-block" id="btnDeleteDok">Hapus Dokumen</button>` : ''}
  `;
  const close = openModal(isEdit ? 'Ubah Dokumen' : 'Tambah Dokumen', body, async data => {
    if (isEdit) { await api('updateDokumen', { id: item.ID, ...data }, 'POST'); }
    else { await api('addDokumen', data, 'POST'); }
    toast('Dokumen tersimpan');
    renderDokumen();
  });
  if (isEdit) {
    setTimeout(() => {
      document.getElementById('btnDeleteDok')?.addEventListener('click', async () => {
        if (!confirm('Hapus dokumen ini?')) return;
        await api('deleteDokumen', { id: item.ID }, 'POST');
        toast('Dokumen dihapus');
        close();
        renderDokumen();
      });
    });
  }
}
function STATUS_OPTS() { return ['Belum', 'Proses', 'Selesai']; }

// ====================== ABSENSI ======================
async function renderAbsensi() {
  const kelas = window.__absKelas || (state.kelasList[0] && state.kelasList[0]['Nama Kelas']) || '';
  const tanggal = window.__absTgl || new Date().toISOString().slice(0, 10);
  window.__absKelas = kelas; window.__absTgl = tanggal;

  const siswa = kelas ? await api('getSiswa', { kelas }) : [];
  const existing = kelas ? await api('getAbsensi', { kelas, tanggal }) : [];
  const existingMap = {};
  existing.forEach(e => existingMap[e.Siswa] = e);

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><h1>Absensi</h1><div class="subtitle">Catat kehadiran siswa per kelas per tanggal</div></div>
    </div>
    <div class="toolbar">
      <select id="absKelas" class="filter-select">${kelasOptions(kelas, false)}</select>
      <input type="date" id="absTanggal" value="${tanggal}" style="max-width:180px;">
    </div>
    <div class="card">
      ${siswa.length ? `
        <div id="rosterList">
          ${siswa.map(s => {
            const cur = existingMap[s.ID] ? existingMap[s.ID].Status : 'Hadir';
            return `<div class="roster-row" data-siswa-id="${esc(s.ID)}" data-siswa-nama="${esc(s.Nama)}">
              <div class="roster-name">${esc(s.Nama)} <span class="mono" style="color:var(--ink-soft);font-size:12px;">${esc(s.NIS)}</span></div>
              <div class="status-pills">
                ${['Hadir', 'Sakit', 'Izin', 'Alpa'].map(st => `<button type="button" class="status-pill ${st === cur ? 'selected ' + st : ''}" data-status="${st}">${st}</button>`).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
        <button class="btn btn-primary" id="btnSaveAbsensi" style="margin-top:18px;">Simpan Absensi</button>
      ` : `<div class="empty-state"><div class="display">Belum ada siswa di kelas ini</div>Tambahkan siswa lewat menu Kelas &amp; Siswa.</div>`}
    </div>
  `;

  document.getElementById('absKelas').addEventListener('change', e => { window.__absKelas = e.target.value; renderAbsensi(); });
  document.getElementById('absTanggal').addEventListener('change', e => { window.__absTgl = e.target.value; renderAbsensi(); });

  document.querySelectorAll('.roster-row .status-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const row = pill.closest('.roster-row');
      row.querySelectorAll('.status-pill').forEach(p => p.className = 'status-pill');
      pill.classList.add('selected', pill.dataset.status);
    });
  });

  document.getElementById('btnSaveAbsensi')?.addEventListener('click', async () => {
    const rows = document.querySelectorAll('.roster-row');
    const records = Array.from(rows).map(row => ({
      siswaId: row.dataset.siswaId,
      siswaNama: row.dataset.siswaNama,
      status: row.querySelector('.status-pill.selected')?.dataset.status || 'Hadir'
    }));
    try {
      await api('saveAbsensi', { kelas, tanggal, records: JSON.stringify(records) }, 'POST');
      toast('Absensi tersimpan');
    } catch (err) { toast(err.message, true); }
  });
}

// ====================== NILAI ======================
async function renderNilai() {
  const kelas = window.__nilKelas || (state.kelasList[0] && state.kelasList[0]['Nama Kelas']) || '';
  window.__nilKelas = kelas;
  const jenisPenilaian = window.__nilJenis ?? '';
  const semester = window.__nilSemester || SEMESTER_OPTIONS[0];
  window.__nilSemester = semester;

  const siswa = kelas ? await api('getSiswa', { kelas }) : [];
  const nilaiList = kelas ? await api('getNilai', { kelas, semester }) : [];

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><h1>Nilai</h1><div class="subtitle">Input dan rekap nilai siswa per penilaian</div></div>
    </div>
    <div class="toolbar">
      <select id="nilKelas" class="filter-select">${kelasOptions(kelas, false)}</select>
      <select id="nilSemester" class="filter-select" style="max-width:130px;">
        ${SEMESTER_OPTIONS.map(s => `<option ${s === semester ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <input id="nilJenis" placeholder="Nama penilaian, mis. Ulangan Harian 1" value="${esc(jenisPenilaian)}" style="max-width:280px;">
    </div>

    ${siswa.length && jenisPenilaian ? `
      <div class="card" style="padding:0;">
        <table><thead><tr><th>Nama</th><th style="width:140px;">Nilai</th></tr></thead>
        <tbody>
          ${siswa.map(s => {
            const existing = nilaiList.find(n => n.Siswa === s.ID && n['Jenis Penilaian'] === jenisPenilaian);
            return `<tr>
              <td>${esc(s.Nama)}</td>
              <td><input type="number" min="0" max="100" class="nilai-input" data-siswa-id="${esc(s.ID)}" data-siswa-nama="${esc(s.Nama)}" data-existing-id="${existing ? esc(existing.ID) : ''}" value="${existing ? esc(existing.Nilai) : ''}"></td>
            </tr>`;
          }).join('')}
        </tbody></table>
      </div>
      <button class="btn btn-primary" id="btnSaveNilai" style="margin-top:16px;">Simpan Nilai</button>
    ` : `<div class="empty-state"><div class="display">${!siswa.length ? 'Belum ada siswa di kelas ini' : 'Isi nama penilaian di atas'}</div>${!siswa.length ? 'Tambahkan siswa lewat menu Kelas & Siswa.' : 'Contoh: "Ulangan Harian 1", "Tugas Bab 3", "UTS".'}</div>`}

    <div class="section-label">Riwayat Nilai — ${esc(kelas)} (${esc(semester)})</div>
    <div class="card" style="padding:0;">
      ${nilaiList.length ? `<table><thead><tr><th>Nama</th><th>Penilaian</th><th>Nilai</th><th>Tanggal</th><th></th></tr></thead><tbody>
        ${nilaiList.map(n => {
          const s = siswa.find(x => x.ID === n.Siswa);
          return `<tr>
            <td>${esc(s ? s.Nama : n.Siswa)}</td>
            <td>${esc(n['Jenis Penilaian'])}</td>
            <td class="mono">${esc(n.Nilai)}</td>
            <td class="mono">${esc(n.Tanggal)}</td>
            <td><button class="btn btn-sm btn-danger" data-del-nilai="${esc(n.ID)}">Hapus</button></td>
          </tr>`;
        }).join('')}
      </tbody></table>` : `<div class="empty-state">Belum ada nilai tercatat untuk kelas &amp; semester ini.</div>`}
    </div>
  `;

  document.getElementById('nilKelas').addEventListener('change', e => { window.__nilKelas = e.target.value; renderNilai(); });
  document.getElementById('nilSemester').addEventListener('change', e => { window.__nilSemester = e.target.value; renderNilai(); });
  document.getElementById('nilJenis').addEventListener('change', e => { window.__nilJenis = e.target.value; renderNilai(); });

  document.getElementById('btnSaveNilai')?.addEventListener('click', async btn => {
    const inputs = document.querySelectorAll('.nilai-input');
    const button = document.getElementById('btnSaveNilai');
    button.disabled = true; button.textContent = 'Menyimpan...';
    try {
      for (const inp of inputs) {
        if (inp.value === '') continue;
        const payload = {
          Siswa: inp.dataset.siswaId, Kelas: kelas, 'Jenis Penilaian': jenisPenilaian,
          'Nama Penilaian': jenisPenilaian, Nilai: inp.value, Semester: semester,
          Tanggal: new Date().toISOString().slice(0, 10)
        };
        if (inp.dataset.existingId) await api('updateNilai', { id: inp.dataset.existingId, ...payload }, 'POST');
        else await api('addNilai', payload, 'POST');
      }
      toast('Nilai tersimpan');
      renderNilai();
    } catch (err) { toast(err.message, true); button.disabled = false; button.textContent = 'Simpan Nilai'; }
  });

  document.querySelectorAll('[data-del-nilai]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus nilai ini?')) return;
      await api('deleteNilai', { id: btn.dataset.delNilai }, 'POST');
      toast('Nilai dihapus');
      renderNilai();
    });
  });
}

// ====================== CATATAN ======================
async function renderCatatan() {
  const kelas = window.__catKelas || (state.kelasList[0] && state.kelasList[0]['Nama Kelas']) || '';
  window.__catKelas = kelas;
  const siswaAll = kelas ? await api('getSiswa', { kelas }) : [];
  const siswaId = window.__catSiswa || (siswaAll[0] && siswaAll[0].ID) || '';
  window.__catSiswa = siswaId;
  const catatan = siswaId ? await api('getCatatan', { siswa: siswaId }) : [];
  const activeSiswa = siswaAll.find(s => s.ID === siswaId);

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><h1>Catatan Siswa</h1><div class="subtitle">Catatan akademik, perilaku, dan prestasi per siswa</div></div>
    </div>
    <div class="toolbar">
      <select id="catKelas" class="filter-select">${kelasOptions(kelas, false)}</select>
      <select id="catSiswa" class="filter-select">
        ${siswaAll.map(s => `<option value="${esc(s.ID)}" ${s.ID === siswaId ? 'selected' : ''}>${esc(s.Nama)}</option>`).join('')}
      </select>
    </div>

    ${activeSiswa ? `
    <div class="card" style="margin-bottom:20px;">
      <div class="section-label" style="margin-top:0;">Tambah Catatan — ${esc(activeSiswa.Nama)}</div>
      <form id="catForm">
        <div class="field-row">
          <div class="field">
            <label>Kategori</label>
            <select name="Kategori">${KATEGORI_CATATAN.map(k => `<option>${k}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Tanggal</label>
            <input type="date" name="Tanggal" value="${new Date().toISOString().slice(0, 10)}" required>
          </div>
        </div>
        <div class="field">
          <label>Isi Catatan</label>
          <textarea name="Isi Catatan" rows="3" required placeholder="Tuliskan catatan..."></textarea>
        </div>
        <button class="btn btn-primary" type="submit">Simpan Catatan</button>
      </form>
    </div>

    <div class="section-label">Riwayat Catatan</div>
    <div class="card" style="padding:0;">
      ${catatan.length ? catatan.map(c => `
        <div style="padding:14px 20px;border-bottom:1px solid var(--line);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span class="badge Proses" style="background:var(--brass-soft);color:var(--brass);">${esc(c.Kategori)}</span>
            <div>
              <span class="mono" style="color:var(--ink-soft);font-size:12px;">${esc(c.Tanggal)}</span>
              <button class="btn btn-sm btn-danger" style="margin-left:10px;" data-del-catatan="${esc(c.ID)}">Hapus</button>
            </div>
          </div>
          <div>${esc(c['Isi Catatan'])}</div>
        </div>
      `).join('') : `<div class="empty-state">Belum ada catatan untuk siswa ini.</div>`}
    </div>
    ` : `<div class="empty-state"><div class="display">Belum ada siswa di kelas ini</div>Tambahkan siswa lewat menu Kelas &amp; Siswa.</div>`}
  `;

  document.getElementById('catKelas').addEventListener('change', e => { window.__catKelas = e.target.value; window.__catSiswa = null; renderCatatan(); });
  document.getElementById('catSiswa')?.addEventListener('change', e => { window.__catSiswa = e.target.value; renderCatatan(); });

  document.getElementById('catForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    try {
      await api('addCatatan', { Siswa: siswaId, Kelas: kelas, ...data }, 'POST');
      toast('Catatan tersimpan');
      renderCatatan();
    } catch (err) { toast(err.message, true); }
  });

  document.querySelectorAll('[data-del-catatan]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus catatan ini?')) return;
      await api('deleteCatatan', { id: btn.dataset.delCatatan }, 'POST');
      toast('Catatan dihapus');
      renderCatatan();
    });
  });
}

// ====================== KELAS & SISWA ======================
async function renderKelas() {
  const kelasList = state.kelasList;
  const filterKelas = window.__ksKelas || '';
  const siswaList = await api('getSiswa', filterKelas ? { kelas: filterKelas } : {});

  document.getElementById('pageContent').innerHTML = `
    <div class="page-header">
      <div><h1>Kelas &amp; Siswa</h1><div class="subtitle">Kelola daftar kelas dan data induk siswa</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <div class="section-label" style="margin-top:0;">Daftar Kelas</div>
        ${kelasList.length ? kelasList.map(k => `
          <div class="roster-row"><div class="roster-name">${esc(k['Nama Kelas'])}</div>
          <button class="btn btn-sm btn-danger" data-del-kelas="${esc(k.ID)}">Hapus</button></div>
        `).join('') : `<div class="empty-state">Belum ada kelas.</div>`}
        <form id="addKelasForm" style="margin-top:14px;display:flex;gap:8px;">
          <input name="Nama Kelas" placeholder="mis. VII-A" required style="flex:1;">
          <button class="btn btn-primary" type="submit">Tambah</button>
        </form>
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div class="section-label" style="margin-top:0;">Daftar Siswa</div>
          <button class="btn btn-sm" id="btnImportSiswa" type="button">Import Banyak Siswa</button>
        </div>
        <select id="ksKelasFilter" class="filter-select" style="margin-bottom:12px;">
          <option value="">Semua Kelas</option>${kelasOptions(filterKelas, false)}
        </select>
        <div style="max-height:340px;overflow-y:auto;">
        ${siswaList.length ? siswaList.map(s => `
          <div class="roster-row"><div class="roster-name">${esc(s.Nama)} <span class="mono" style="color:var(--ink-soft);font-size:12px;">${esc(s.NIS)} &middot; ${esc(s.Kelas)}</span></div>
          <button class="btn btn-sm btn-danger" data-del-siswa="${esc(s.ID)}">Hapus</button></div>
        `).join('') : `<div class="empty-state">Belum ada siswa.</div>`}
        </div>
        <form id="addSiswaForm" style="margin-top:14px;">
          <div class="field-row">
            <input name="Nama" placeholder="Nama siswa" required>
            <input name="NIS" placeholder="NIS">
          </div>
          <div class="field-row" style="margin-top:8px;">
            <select name="Kelas" required>${kelasOptions('', false)}</select>
            <button class="btn btn-primary" type="submit">Tambah</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('addKelasForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('addKelas', Object.fromEntries(fd.entries()), 'POST');
    state.kelasList = await api('getKelas');
    toast('Kelas ditambahkan');
    renderKelas();
  });
  document.querySelectorAll('[data-del-kelas]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Hapus kelas ini? (Data siswa terkait tidak otomatis terhapus)')) return;
    await api('deleteKelas', { id: btn.dataset.delKelas }, 'POST');
    state.kelasList = await api('getKelas');
    toast('Kelas dihapus');
    renderKelas();
  }));

  document.getElementById('ksKelasFilter').addEventListener('change', e => { window.__ksKelas = e.target.value; renderKelas(); });

  document.getElementById('addSiswaForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api('addSiswa', Object.fromEntries(fd.entries()), 'POST');
    toast('Siswa ditambahkan');
    renderKelas();
  });
  document.querySelectorAll('[data-del-siswa]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Hapus siswa ini?')) return;
    await api('deleteSiswa', { id: btn.dataset.delSiswa }, 'POST');
    toast('Siswa dihapus');
    renderKelas();
  }));

  document.getElementById('btnImportSiswa').addEventListener('click', () => importSiswaModal());
}

function importSiswaModal() {
  const body = `
    <div class="field">
      <label>Kelas Tujuan</label>
      <select name="kelas" required>${kelasOptions('', false)}</select>
    </div>
    <div class="field">
      <label>Daftar Siswa</label>
      <textarea name="daftar" rows="10" required placeholder="Satu siswa per baris. Format bebas:&#10;Ahmad Fauzi, 1001&#10;Budi Santoso, 1002&#10;Citra Dewi"></textarea>
      <div class="doc-notes" style="margin-top:6px;">Satu nama per baris. NIS opsional, pisahkan dengan koma atau tab setelah nama.</div>
    </div>
  `;
  openModal('Import Banyak Siswa', body, async data => {
    const lines = data.daftar.split('\n').map(l => l.trim()).filter(Boolean);
    const records = lines.map(line => {
      const parts = line.split(/,|\t/).map(p => p.trim());
      return { nama: parts[0], nis: parts[1] || '' };
    });
    if (!records.length) throw new Error('Tidak ada baris yang bisa diimpor');
    const result = await api('addSiswaBulk', { kelas: data.kelas, records: JSON.stringify(records) }, 'POST');
    toast(`${result.imported} siswa berhasil diimpor`);
    renderKelas();
  }, 'Import');
}

// ====================== INIT ======================
goTo('dashboard');
