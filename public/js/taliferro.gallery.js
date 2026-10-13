(function () {
  var images = Array.prototype.map.call(
    document.querySelectorAll('.gallery-scene img'),
    function (img) { return img; }
  );
  if (!images.length) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      entry.target.classList.toggle('is-active', entry.isIntersecting);
    });
  }, { threshold: 0.6 });

  images.forEach(function (img) { observer.observe(img); });

  // Preload the next couple of images as each scene becomes active.
  var preloaded = {};
  function preload(img) {
    if (preloaded[img.src]) return;
    preloaded[img.src] = true;
    var preloadImg = new Image();
    preloadImg.src = img.src;
  }

  var priorityObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var idx = images.indexOf(entry.target);
      for (var i = idx + 1; i <= idx + 2 && i < images.length; i++) {
        preload(images[i]);
      }
    });
  }, { threshold: 0.1 });

  images.forEach(function (img) { priorityObserver.observe(img); });

  // Hide the "scroll" hint as soon as the user actually scrolls.
  var hint = document.querySelector('.gallery-scroll-hint');
  var viewport = document.querySelector('.gallery-viewport');
  if (hint && viewport) {
    var hideHint = function () {
      hint.classList.add('is-hidden');
      viewport.removeEventListener('scroll', hideHint);
    };
    viewport.addEventListener('scroll', hideHint, { passive: true });
  }
})();
