'use strict';

// Set these to the club's published URLs. Only public match information belongs here.
const club = {
  appUrl: '/app/',
};

const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
function setMenu(open) {
  navigation.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Chiudi menu' : 'Apri menu');
}
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => {
  if (event.target.closest('a,button')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    setMenu(false);
    menu.focus();
  }
});

const access = document.querySelector('#access');
document.querySelectorAll('[data-access]').forEach(button => {
  button.addEventListener('click', () => access.showModal());
});
if (club.appUrl) {
  const link = document.querySelector('#open-app');
  link.href = club.appUrl;
  link.hidden = false;
  document.querySelector('#app-status').hidden = true;
}

const calendar = document.querySelector('#calendar');
const toggle = document.querySelector('#calendar-toggle');
toggle.addEventListener('click', () => {
  calendar.hidden = !calendar.hidden;
  toggle.setAttribute('aria-expanded', String(!calendar.hidden));
});
const feed = 'https://wuegkedznuzcbwcfmqma.supabase.co';
const publicKey = 'sb_publishable_tIf_j7j9Xh6ZdZzSSeE3rQ_KF3s3U1K';
const calendarState = document.querySelector('#calendar-state');
const nextMatch = document.querySelector('#next');
const rows = document.querySelector('#fixtures');

const dateFormat = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'full', timeZone: 'UTC',
});

function matchLabel(match) {
  const teams = match.trasferta ? [match.avversario, 'Gemina FC'] : ['Gemina FC', match.avversario];
  const date = dateFormat.format(new Date(match.data + 'T12:00:00Z'));
  return [teams.join(' – '), date, match.orario, match.luogo].filter(Boolean).join(' · ');
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function showLineup(match) {
  const row = element('li');
  const players = match.campo ?? [];
  if (!players.length) {
    row.textContent = match.formazione?.join(' · ') || 'Formazione in arrivo.';
    return row;
  }
  row.append(element('h3', ['Formazione', match.modulo].filter(Boolean).join(' · ')));
  const pitch = element('ul', '', 'pitch');
  for (const player of players) {
    const marker = element('li', '', 'pitch-player');
    marker.style.left = Number(player.x) + '%';
    marker.style.top = Number(player.y) + '%';
    marker.append(element('b', String(player.numero ?? '—')), element('span', player.cognome));
    pitch.append(marker);
  }
  row.append(pitch);
  return row;
}

const authFragment = new URLSearchParams(location.hash.slice(1));
const authQuery = new URLSearchParams(location.search);
const authReturn = authQuery.has('voto') || authQuery.has('code') ||
  authFragment.has('access_token') || authFragment.has('error') || authQuery.has('error');
const authFailed = authFragment.has('error') || authQuery.has('error') ||
  authFragment.has('error_code') || authQuery.has('error_code');

const fanClient = window.supabase?.createClient(feed, publicKey, {
  auth: { storageKey: 'gemina-tifosi', persistSession: true },
});
const pollList = document.querySelector('#polls');
const pollStatus = document.querySelector('#poll-state');
const pollDate = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome',
});
let matches = [];
let polls = [];
let results = [];
let votes = [];
let session = null;

async function publicRows(table, query) {
  const response = await fetch(feed + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: publicKey },
  });
  if (!response.ok) throw new Error('Dati non disponibili');
  return response.json();
}

function renderPolls() {
  pollList.replaceChildren();
  for (const poll of polls) {
    const match = matches.find(m => m.data === poll.data && m.avversario === poll.avversario);
    const card = element('section', '', 'poll-card');
    const now = Date.now();
    const isClosed = now >= Date.parse(poll.chiude);
    const isOpen = !isClosed && now >= Date.parse(poll.apre);
    const candidates = match?.candidati ?? [];
    card.append(element('h3', poll.titolo));
    if (match?.migliore) card.append(element('p', 'MVP della squadra · ' + match.migliore));
    if (isClosed) {
      const ranking = results.filter(r => r.sondaggio === poll.id).sort((a, b) => b.voti - a.voti);
      const winner = ranking[0];
      const player = candidates.find(c => c.id === winner?.candidato);
      const tie = winner && ranking[1]?.voti === winner.voti;
      card.append(element('p', tie ? 'Votazione chiusa · parità di voti.' :
        player ? 'MVP dei tifosi · ' + player.nome + ' (' + winner.voti + ' voti)' : 'Votazione chiusa.'));
    } else if (!isOpen) {
      card.append(element('p', 'Le votazioni aprono il ' + pollDate.format(new Date(poll.apre)) + '.'));
    } else {
      const priorVote = votes.find(v => v.sondaggio === poll.id);
      card.append(element('p', 'Vota entro il ' + pollDate.format(new Date(poll.chiude)) + '.'));
      if (priorVote) card.append(element('p', 'Hai già votato per questa partita.'));
      else if (candidates.length && fanClient) card.append(buildVoteForm(poll, candidates));
      else card.append(element('p', 'Candidati in aggiornamento.'));
    }
    pollList.append(card);
  }
}

function buildVoteForm(poll, candidates) {
  const form = element('form', '', 'poll-form');
  const label = element('label', session ? 'Scegli un giocatore' : 'Email');
  const field = element(session ? 'select' : 'input');
  if (session) {
    field.append(new Option('Seleziona un giocatore', ''));
    for (const c of candidates) field.append(new Option(c.nome, c.id));
  } else {
    field.type = 'email';
    field.autocomplete = 'email';
  }
  field.required = true;
  label.append(field);
  const button = element('button', session ? 'Vota' : 'Ricevi il link per votare', 'button lime');
  button.type = 'submit';
  const message = element('p');
  message.setAttribute('role', 'status');
  form.append(label, button, message);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    button.disabled = true;
    message.textContent = '';
    try {
      if (!session) {
        const redirect = new URL('/', location.origin);
        const { error } = await fanClient.auth.signInWithOtp({
          email: field.value.trim(), options: { emailRedirectTo: redirect.href },
        });
        message.textContent = error ? 'Invio non riuscito. Riprova più tardi.' : 'Apri il link che hai ricevuto via email per votare.';
        return;
      }
      const { error } = await fanClient.from('gemina_voti_tifosi').insert({
        sondaggio: poll.id, candidato: field.value,
      });
      if (error && error.code !== '23505') throw error;
      votes.push({ sondaggio: poll.id });
      renderPolls();
    } catch {
      message.textContent = 'Voto non registrato. Verifica che il sondaggio sia ancora aperto e riprova.';
    } finally {
      button.disabled = false;
    }
  });
  return form;
}

async function loadMatches() {
  try {
    const [record] = await publicRows('gemina_partite_web', 'id=eq.c8&select=partite');
    matches = (record?.partite ?? []).filter(match => /^\d{4}-\d{2}-\d{2}$/.test(match.data))
      .sort((a, b) => a.data.localeCompare(b.data) || a.orario.localeCompare(b.orario));
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const upcoming = matches.find(match => !match.risultato && match.data >= today);
    if (upcoming) {
      nextMatch.textContent = matchLabel(upcoming);
      rows.replaceChildren(showLineup(upcoming));
    } else {
      nextMatch.textContent = 'Nessuna partita in programma.';
      toggle.hidden = true;
    }
    calendarState.textContent = '';
  } catch {
    calendarState.textContent = 'Calendario momentaneamente non disponibile.';
  }
}

async function loadPolls() {
  try {
    [polls, results] = await Promise.all([
      publicRows('gemina_sondaggi', 'select=*&order=apre'),
      publicRows('gemina_risultati_tifosi', 'select=*'),
    ]);
    if (fanClient) {
      ({ data: { session } } = await fanClient.auth.getSession());
      if (session) {
        const { data } = await fanClient.from('gemina_voti_tifosi')
          .select('sondaggio').eq('tifoso', session.user.id);
        votes = data ?? [];
      }
    }
    renderPolls();
    pollStatus.textContent = authReturn
      ? session && !authFailed ? 'Accesso riuscito. Ora puoi scegliere un giocatore e votare.'
        : 'Il link non ha completato l’accesso. Richiedine uno nuovo e aprilo nel browser.'
      : '';
  } catch {
    pollStatus.textContent = 'Votazioni momentaneamente non disponibili.';
  }
}

loadMatches().then(loadPolls).then(() => {
  if (authReturn) document.querySelector('#tifosi').scrollIntoView();
});
setInterval(() => {
  if (!document.hidden && !pollList.contains(document.activeElement)) loadPolls();
}, 30000);
