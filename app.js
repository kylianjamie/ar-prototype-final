import * as THREE from "/libs/three/three.module.js";
import { GLTFLoader } from "/libs/three/jsm/GLTFLoader.js";
import { RGBELoader } from "/libs/three/jsm/RGBELoader.js";

class App {
  constructor() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.setAttribute("id", "ar-canvas");

    container.classList.add("hidden");

    this.assetsPath = "/assets/";

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
    this.camera.position.set(0, 1.6, 0);

    this.scene = new THREE.Scene();

    const ambient = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    ambient.position.set(0.5, 1, 0.25);
    this.scene.add(ambient);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(this.renderer.domElement);
    this.setEnvironment();

    this.reticle = new THREE.Mesh(
      new THREE.PlaneBufferGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load("/img/reticle-texture.png"),
        transparent: true,
        opacity: 0.6,
      })
    );

    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    this.scene.add(this.reticle);

    this.setupXR();

    window.addEventListener("resize", this.resize.bind(this));
  }

  setupXR() {
    this.renderer.xr.enabled = true;

    if ("xr" in navigator) {
      navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
        if (supported) {
          document.getElementById("ar-button").classList.remove("hidden");
          document.getElementById("ar-button").classList.add("flex");
        }
      });
    } else {
      notSupported();
    }

    const self = this;

    this.hitTestSourceRequested = false;
    this.hitTestSource = null;

    function onSelect() {
      if (self.chair === undefined) return;

      if (self.reticle.visible) {
        placeClick();
        self.chair.position.setFromMatrixPosition(self.reticle.matrix);
        self.chair.visible = true;
        chairPlaced = true;
      }
    }

    const panHotspot = document.getElementById("pan-hotspot");
    const hammerHotspot = new Hammer(panHotspot);
    hammerHotspot.on("tap", onSelect);

    document.getElementById("similar-button").addEventListener("click", loadSimilar);

    function loadSimilar() {
      if (self.chair) {
        if (self.chair.visible) {
          self.chair.visible = false;
        }
      }

      blockReticle = true;
      self.reticle.visible = false;
      openSimilar();
    }

    document
      .getElementById("close-similar")
      .addEventListener("click", exitSimilar);
    document
      .getElementById("similar-hotspot")
      .addEventListener("click", exitSimilar);

    function exitSimilar() {
      if (self.chair) {
        if (!self.chair.visible && chairPlaced) {
          self.chair.visible = true;
        }
      }

      if (!isLoadingObject) {
        blockReticle = false;
      }
      closeSimilar();
    }

    const thumbWidth = screen.width - 96 + "px";

    const similarThumbs = document.getElementsByClassName("similar-item-thumb");
    for (let i = 0; i < similarThumbs.length; i++) {
      similarThumbs[i].style.width = thumbWidth;
    }

    //clickable card check
    for (let i = 0; i < similarThumbs.length; i++) {
      similarThumbs[i].addEventListener("click", function () {
        clickableCards(i);
      });
    }

    function clickableCards(i) {
      if (!similarThumbs[i].classList.contains("selected-item")) {
        lastChairLocation = self.chair.matrix;
        self.scene.remove(self.chair);
        changeCardOrder(i);
      }
      exitSimilar();
    }

    this.controller = this.renderer.xr.getController(0);
    this.scene.add(this.controller);

    //pan event
    let touchDown, touchX, touchY, deltaX, deltaY;
    const hotspot = document.getElementById("pan-hotspot");

    hotspot.addEventListener("touchstart", function (e) {
        e.preventDefault();
        touchDown = true;
        touchX = e.touches[0].pageX;
        touchY = e.touches[0].pageY;
      },
      false
    );

    hotspot.addEventListener("touchend", function (e) {
        e.preventDefault();
        touchDown = false;
      },
      false
    );

    hotspot.addEventListener("touchmove", function (e) {
        e.preventDefault();

        if (!touchDown) {
          return;
        }

        deltaX = e.touches[0].pageX - touchX;
        deltaY = e.touches[0].pageY - touchY;
        touchX = e.touches[0].pageX;
        touchY = e.touches[0].pageY;

        rotateObject();
      },
      false
    );

    function rotateObject() {
      if (self.chair) {
        self.chair.rotation.y += deltaX / 100;
      }
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  setEnvironment() {
    const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const self = this;

    loader.load(
      "/assets/hdr/venice_sunset_1k.hdr",
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        pmremGenerator.dispose();

        self.scene.environment = envMap;
      },
      undefined,
      (err) => {
        console.error("An error occurred setting the environment");
      }
    );
  }

  showChair(model) {
    if (!newChair) {
      this.initAR();
    }

    // show css loader when assets are loading
    const manager = new THREE.LoadingManager();
    const self = this;

    if (newChair) {
      manager.onStart = function () {
        isLoadingObject = true;
        blockReticle = true;
        loaderAni.style.visibility = "visible";
        self.reticle.visible = false;
        loaderAni.style.opacity = 1;
      };

      manager.onLoad = function () {
        isLoadingObject = false;
        blockReticle = false;

        if (introStatus != 0) {
          loaderAni.style.opacity = 0;

          setTimeout(function () {
            loaderAni.style.visibility = "hidden";
          }, 500);
        }
      };

      // manager.onProgress = function ( url, itemsLoaded, itemsTotal ) {
      //     console.log( 'Loading file: ' + url + '.\nLoaded ' + itemsLoaded + ' of ' + itemsTotal + ' files.' );
      // };

      manager.onError = function (url) {
        console.log("There was an error loading " + url);
      };
    }

    const loader = new GLTFLoader(manager).setPath(this.assetsPath);

    // Load glTF resource
    loader.load(
      model + `.glb`,
      function (gltf) {
        self.scene.add(gltf.scene);
        self.chair = gltf.scene;

        if (!chairPlaced) {
          self.chair.visible = false;
        }

        if (newChair) {
          self.chair.position.setFromMatrixPosition(lastChairLocation);
        }

        self.renderer.setAnimationLoop(self.render.bind(self));
      },

      // called while loading is progressing
      function (xhr) {},
      // called when loading has errors
      function (error) {
        console.log("An error happened");
      }
    );
  }

  initAR() {
    let currentSession = null;
    const self = this;

    let uiElement = document.getElementById("ui");

    const sessionInit = {
      requiredFeatures: ["hit-test", "dom-overlay"],
      domOverlay: { root: uiElement },
    };

    function onSessionStarted(session) {
      document.getElementById("ar-canvas").classList.remove("hidden");

      session.addEventListener("end", onSessionEnded);

      self.renderer.xr.setReferenceSpaceType("local");
      self.renderer.xr.setSession(session);

      currentSession = session;

      document.getElementById("ui").style.display = "flex";
      document.getElementById("intro-txt").style.opacity = 1;

      if (!currentSession.domOverlayState) {
        currentSession.end();
        notSupported();
      }
    }

    function onSessionEnded() {
      document.getElementById("ar-canvas").classList.add("hidden");
      currentSession.removeEventListener("end", onSessionEnded);

      currentSession = null;

      if (self.chair !== null) {
        self.scene.remove(self.chair);
        self.chair = null;
      }

      document.getElementById("ui").style.display = "none";
      resetVariables();

      closeSimilar();

      self.renderer.setAnimationLoop(null);
    }

    if (currentSession === null) {
      navigator.xr
        .requestSession("immersive-ar", sessionInit)
        .then(onSessionStarted)
        .catch((err) => notSupported());
    } else {
      currentSession.end();
    }
  }

  requestHitTestSource() {
    const self = this;

    const session = this.renderer.xr.getSession();

    session.requestReferenceSpace("viewer").then(function (referenceSpace) {
      session
        .requestHitTestSource({ space: referenceSpace })
        .then(function (source) {
          self.hitTestSource = source;
        });
    });

    session.addEventListener("end", function () {
      self.hitTestSourceRequested = false;
      self.hitTestSource = null;
      self.referenceSpace = null;
    });

    this.hitTestSourceRequested = true;
  }

  getHitTestResults(frame) {
    const hitTestResults = frame.getHitTestResults(this.hitTestSource);

    if (hitTestResults.length) {
      if (introStatus == 0) {
        toSecondIntro();
      }

      const referenceSpace = this.renderer.xr.getReferenceSpace();
      const hit = hitTestResults[0];
      const pose = hit.getPose(referenceSpace);

      if (!blockReticle) {
        this.reticle.visible = true;
      }

      this.reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      this.reticle.visible = false;
    }
  }

  render(timestamp, frame) {
    if (frame) {
      if (this.hitTestSourceRequested === false) this.requestHitTestSource();

      if (this.hitTestSource) this.getHitTestResults(frame);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

export { App };
