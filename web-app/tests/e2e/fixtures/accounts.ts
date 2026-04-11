export const ownerAccount = {
  email: process.env.E2E_OWNER_EMAIL || 'martiingadeea1996@gmail.com',
  password: process.env.E2E_OWNER_PASSWORD || 'Prueba123!',
};

export const playerAccounts = (
  process.env.E2E_PLAYER_EMAILS
    ? process.env.E2E_PLAYER_EMAILS.split(',').map((x) => x.trim()).filter(Boolean)
    : [
        'testwebpadel1@gmail.com',
        'testwebpadel2@gmail.com',
        'testwebpadel3@gmail.com',
        'testwebpadel4@gmail.com',
        'testwebpadel5@gmail.com',
        'testwebpadel6@gmail.com',
        'testwebpadel7@gmail.com',
        'testwebpadel8@gmail.com',
      ]
).map((email) => ({
  email,
  password: process.env.E2E_PLAYERS_PASSWORD || 'Prueba123!',
}));

