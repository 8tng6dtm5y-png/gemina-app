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

async function loadMatches() {
  try {
    const response = await fetch(feed + '/rest/v1/gemina_partite_web?id=eq.c8&select=partite', {
      headers: { apikey: publicKey },
    });
    if (!response.ok) throw new Error('Calendario non disponibile');
    const [record] = await response.json();
    const matches = (record?.partite ?? []).filter(match => /^\d{4}-\d{2}-\d{2}$/.test(match.data))
      .sort((a, b) => a.data.localeCompare(b.data) || a.orario.localeCompare(b.orario));
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
    const upcoming = matches.find(match => !match.risultato && match.data >= today);
    if (upcoming) nextMatch.textContent = matchLabel(upcoming);
    calendarState.textContent = matches.length ? '' : 'Il calendario ufficiale non è ancora stato pubblicato.';
    for (const match of matches) {
      const row = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = matchLabel(match);
      row.append(title);
      const score = match.risultato && (match.trasferta ? [...match.risultato].reverse() : match.risultato);
      for (const detail of [
        score && 'Risultato · ' + score.join('–'),
        match.formazione?.length && ['Formazione', match.modulo, match.formazione.join(', ')].filter(Boolean).join(' · '),
        match.migliore && 'Migliore in campo · ' + match.migliore,
      ].filter(Boolean)) {
        const line = document.createElement('div');
        line.textContent = detail;
        row.append(line);
      }
      rows.append(row);
    }
  } catch {
    calendarState.textContent = 'Calendario momentaneamente non disponibile.';
  }
}
loadMatches();
