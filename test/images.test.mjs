import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBrandedShareImage, sizeHint, upgradeImageUrl } from '../lib/images.mjs';
import { reusePrevious } from '../lib/pipeline.mjs';

test('upgradeImageUrl asks CDNs for a larger rendition of the same picture', () => {
  assert.equal(
    upgradeImageUrl('https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/9cc0/live/a.jpg'),
    'https://ichef.bbci.co.uk/ace/standard/1536/cpsprodpb/9cc0/live/a.jpg',
  );
  assert.equal(
    upgradeImageUrl('https://i0.wp.com/jack-clark.net/wp-content/uploads/x.png?resize=150%2C150&ssl=1'),
    'https://i0.wp.com/jack-clark.net/wp-content/uploads/x.png?ssl=1',
  );
  assert.equal(upgradeImageUrl('https://lh3.googleusercontent.com/abc123=w528-h297-n-nu'), 'https://lh3.googleusercontent.com/abc123=w1600');
  const guardian = 'https://i.guim.co.uk/img/media/abc/master/5001.jpg?width=700&quality=85&s=signature';
  assert.equal(upgradeImageUrl(guardian), guardian, 'signed URLs are left alone');
});

test('logo-stamped share images are recognised', () => {
  assert.ok(isBrandedShareImage('https://i.guim.co.uk/img/media/x/master/1.jpg?width=1200&height=630&quality=85&auto=format&fit=crop&overlay-align=bottom%2Cleft&overlay-width=100p&overlay-base64=L2ltZy&s=abc'));
  assert.ok(!isBrandedShareImage('https://i.guim.co.uk/img/media/x/master/1.jpg?width=700&quality=85&s=abc'));
  assert.ok(!isBrandedShareImage(null));
});

test('sizeHint reads the width a URL claims', () => {
  assert.equal(sizeHint('https://i.guim.co.uk/img/media/abc/master/5001.jpg?width=700&s=x'), 700);
  assert.equal(sizeHint('https://storage.googleapis.com/x/images/Koch_social.max-600x600.format-webp.webp'), 600);
  assert.equal(sizeHint('https://techcrunch.com/wp-content/uploads/2026/09/a.jpg?resize=1200,800'), 1200);
  assert.equal(sizeHint('https://example.com/wp-content/uploads/photo-300x200.jpg'), 300);
  assert.equal(sizeHint('https://images.axios.com/abc=/0x0:7753x4361/1366x768/2026/09/14/1.jpeg'), null);
});

test('reusePrevious keeps a sharper or rejected picture while the feed offers the same small one', () => {
  const small = 'https://i.guim.co.uk/img/media/abc/master/5001.jpg?width=700&s=x';
  const item = { url: 'https://g.example/a', image: small, summary: 'x', title: 'T', topics: [] };

  const [upgraded] = reusePrevious([item], [{ url: item.url, image: 'https://i.guim.co.uk/og.jpg', feedImage: small, imageWidth: 1200 }]);
  assert.equal(upgraded.image, 'https://i.guim.co.uk/og.jpg');
  assert.equal(upgraded.imageWidth, 1200);

  const [rejected] = reusePrevious([item], [{ url: item.url, image: '', feedImage: small, imageWidth: 150 }]);
  assert.equal(rejected.image, '', 'stays rejected, so it keeps its illustration');

  const [changed] = reusePrevious([{ ...item, image: 'https://i.guim.co.uk/new-photo.jpg?width=700&s=y' }], [{ url: item.url, image: 'https://i.guim.co.uk/og.jpg', feedImage: small, imageWidth: 1200 }]);
  assert.equal(changed.image, 'https://i.guim.co.uk/new-photo.jpg?width=700&s=y', 'a new feed picture is looked at again');
});
