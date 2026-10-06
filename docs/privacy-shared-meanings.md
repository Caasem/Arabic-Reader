# Privacy: Shared meanings

*Draft for review. It describes what the app and server in this repository do. Have it checked against the law that applies
to your readers before you publish it, and fill in the bracketed parts.*

**What this is.** Arabic Reader can learn which dictionary entry fits a word in a book from what its readers save. If you
turn on "Help improve meanings for everyone" in Settings, the entries you save are counted together with other readers'
saves, and the app then shows the entry most readers saved first. It is off until you turn it on.

## What we receive

When you save a word from the dictionary popup (with the round + on an entry, by saving picked words, or by editing and saving
a meaning), the app sends:

- which book (a short code worked out from its title, author and language, not the book file);
- which word (a short code worked out from its dictionary form);
- which dictionary entry you saved, and, if you saved only part of an entry, which meaning;
- the day, and where the entry stood in the list when you saw it;
- a random ID for this installation of the app.

If you remove the saved word, the app sends that it was removed.

## What we do not receive

The text of your books, your sentences, notes, highlights, flashcards, review history, other books you read, your name,
your email, or your device's name. Saves from dictionaries you loaded yourself are never sent.

## What this means in practice

- **The ID is random, not anonymous.** It is not linked to your name or email, but all the saves from one installation share
  it, so they can be linked to each other. The short codes for books and words are not secret: someone who knows a book title
  could work out its code. So the server can tell which books an installation reads and which entries it chose.
- **Network address.** When the app connects, our hosting provider and the server see your network address. We use it only to
  limit abuse, and it is not stored with your saves. The hosting provider ([Cloudflare, or the provider you deploy to]) runs
  the server for us and can see network addresses and the stored saves.
- **We do not sell or give your saves to anyone.** They are combined with other readers' saves to order entries in this app.
  No one outside the people who run the service sees them, other than the hosting provider that stores them.

## How long we keep it

Your saves are kept while your installation is active. An installation that has not connected for 12 months is deleted with
its saves. Retractions are kept for 30 days so that a delayed message cannot undo them. Backups are kept for 30 days.

## Your choices

- **Turn it off** in Settings. The app stops sending, empties what was waiting to be sent, and stops fetching rankings.
- **Delete what you shared**: Settings → Shared meanings → "Delete what I shared". This removes every save from the server and
  gives this device a new random ID. The rankings the app already holds are not tied to you. Copies in backups are removed
  after at most 30 days and are never restored to the live service.
- **If you lost this device**: when you first share, the app shows a recovery code once. With it we can delete your saves
  without the device. **If you lost both the device and the recovery code, we cannot tell who is asking, so we cannot delete
  on request.** Those saves expire after 12 months of inactivity.
- **Sign in with Apple** (when available, and optional): lets your saves count once across your devices. We keep only a
  one-way code derived from your Apple user ID, never your Apple email.

## Contact

[Add a contact address for questions and requests.]
