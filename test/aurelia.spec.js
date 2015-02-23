import {Aurelia} from '../src/index';
import {Container} from 'aurelia-dependency-injection';
import {Loader} from 'aurelia-loader';
import {BindingLanguage, ResourceCoordinator, ViewSlot, ResourceRegistry, CompositionEngine} from 'aurelia-templating';
import {Plugins} from '../src/plugins';
import * as LogManager from 'aurelia-logging';

describe('aurelia', () => {
  describe("constructor", () => {

    it("should have good defaults", () => {
      let mockLoader = {};
      spyOn(Loader, 'createDefaultLoader').and.returnValue(mockLoader);
      let aurelia = new Aurelia();

      expect(aurelia.loader).toBe(mockLoader);
      expect(aurelia.container).toEqual(jasmine.any(Container));
      expect(aurelia.resources).toEqual(jasmine.any(ResourceRegistry));
      expect(aurelia.use).toEqual(jasmine.any(Plugins));
      expect(aurelia.started).toBeFalsy();
    });

    it("will take in a loader, container and resource registry", () => {
      let mockLoader = jasmine.createSpy('loader');
      let mockResources = jasmine.createSpy('resourceRegistry');
      let mockContainer = jasmine.createSpyObj('container', ['registerInstance']);

      let aurelia = new Aurelia(mockLoader, mockContainer, mockResources);
      expect(aurelia.loader).toBe(mockLoader);
      expect(aurelia.container).toBe(mockContainer);
      expect(aurelia.resources).toBe(mockResources);
      expect(aurelia.use).toEqual(jasmine.any(Plugins));
      expect(aurelia.started).toBeFalsy();

      //Lets check the container was called
      expect(mockContainer.registerInstance).toHaveBeenCalledWith(Aurelia, aurelia);
      expect(mockContainer.registerInstance).toHaveBeenCalledWith(Loader, mockLoader);
      expect(mockContainer.registerInstance).toHaveBeenCalledWith(ResourceRegistry, mockResources);
    });
  });

  describe('with', () => {
    let aurelia, mockContainer, testInstance;
    class TestClass {
    }

    beforeEach(() => {
      mockContainer = jasmine.createSpyObj('container', ['registerInstance', 'registerSingleton']);
      aurelia = new Aurelia({}, mockContainer);
      testInstance = new TestClass();
    });

    it('instance will register a instance with the container', () => {
      expect(aurelia.withInstance(TestClass, testInstance)).toBe(aurelia);
      expect(mockContainer.registerInstance).toHaveBeenCalledWith(TestClass, testInstance);
    });

    it('singleton will register a singleton with the container', () => {
      expect(aurelia.withSingleton(TestClass, testInstance)).toBe(aurelia);
      expect(mockContainer.registerSingleton).toHaveBeenCalledWith(TestClass, testInstance);
    });

    it("resources will add an array of objects", () => {
      expect(aurelia.withResources(['someResource'])).toBe(aurelia);
      expect(aurelia.resourcesToLoad.length).toBe(1);

      var resource = aurelia.resourcesToLoad[0];

      expect(resource.length).toBe(1);
      expect(resource[0]).toEqual('someResource');
    });

    it("resources will add arguments as an array", () => {
      expect(aurelia.withResources('someResource', 'andAnother')).toBe(aurelia);
      expect(aurelia.resourcesToLoad.length).toBe(1);

      var resource = aurelia.resourcesToLoad[0];

      expect(resource.length).toBe(2);
      expect(resource[0]).toEqual('someResource');
      expect(resource[1]).toEqual('andAnother');
    });

    it('resources will set the resourceManifestUrl of the resources if currentPluginId is set in aurelia', () => {
      aurelia.currentPluginId = './plugin';
      expect(aurelia.withResources('someResource')).toBe(aurelia);
      expect(aurelia.resourcesToLoad.length).toBe(1);
      expect(aurelia.resourcesToLoad[0].resourceManifestUrl).toEqual('./plugin');
    });

  });

  describe('start()', () => {
    let aurelia, mockContainer, mockLoader, mockResources, mockPlugin, mockResourceCoordinator;

    beforeEach(() => {
      mockLoader = jasmine.createSpy('loader');
      mockResources = jasmine.createSpy('resourceRegistry');

      mockResourceCoordinator = jasmine.createSpyObj("resourceCoordinator", ["importResources"]);

      mockContainer = jasmine.createSpyObj('container', ['registerInstance', 'hasHandler', 'get']);
      mockContainer.hasHandler.and.returnValue(true);
      mockContainer.get.and.returnValue(mockResourceCoordinator);

      mockPlugin = jasmine.createSpyObj('plugin', ['_process']);
      mockPlugin._process.and.returnValue(new Promise((resolve, error) => {
        resolve();
      }));

      aurelia = new Aurelia(mockLoader, mockContainer, mockResources);
      aurelia.use = mockPlugin;
    });

    it("will return if it's already started", (done) => {
      aurelia.started = true;
      aurelia.start()
        .catch((reason) => expect(true).toBeFalsy(reason))
        .then(done);
    });

    it("will fail if the plugin loader fails", (done) => {
      mockPlugin._process.and.returnValue(new Promise((resolve, error) => {
        error();
      }));

      aurelia.start()
        .then(() => expect(true).toBeFalsy("Startup should have failed"))
        .catch(() => expect(mockPlugin._process).toHaveBeenCalled())
        .then(done);
    });

    //I'm going to assume start should fail
    it("should check for a binding language and log an error if one is not set", (done) => {
      mockContainer.hasHandler.and.returnValue(false);
      aurelia.start()
        .then(() => expect(true).toBeFalsy("Should have not started up"))
        .catch(() => expect(mockContainer.hasHandler).toHaveBeenCalledWith(BindingLanguage))
        .then(done);
    });

    it("should fire a custom event when started", (done) => {
      var documentSpy = spyOn(document, "dispatchEvent").and.callThrough();
      aurelia.start()
        .then((result) => {
          expect(result).toBe(aurelia);
          expect(documentSpy).toHaveBeenCalled();
          var event = documentSpy.calls.mostRecent().args[0];
          expect(event).toEqual(jasmine.any(window.Event));
          expect(event.type).toEqual("aurelia-started");
        })
        .catch(() => expect(true).toBeFalsy("Starting shouldn't have failed"))
        .then(done);
    });

    it("should load resources that are defined and register them with the resource registry", (done) => {
      //I guess plugins should do this but this is fine
      aurelia.resourcesToLoad.push("aResource");
      let resource = jasmine.createSpyObj("resource", ["register"]);

      mockResourceCoordinator.importResources.and.returnValue(new Promise((resolve, error) => {
        resolve([resource]);
      }));

      aurelia.start().then(() => {
        expect(mockResourceCoordinator.importResources).toHaveBeenCalledWith("aResource", undefined);
        expect(resource.register).toHaveBeenCalledWith(mockResources);
      })
        .catch((reason) => expect(true).toBeFalsy(reason))
        .then(done);
    });


  });

  describe('setRoot()', () => {
    let aurelia, mockContainer, mockLoader, mockCompositionEngine, rootModel, composePromise;

    function getLastInstruction() {
      return mockCompositionEngine.compose.calls.mostRecent().args[0];
    }

    beforeEach(() => {
      mockLoader = jasmine.createSpy("loader");
      mockContainer = jasmine.createSpyObj("container", ["get", "registerInstance"]);
      mockCompositionEngine = jasmine.createSpyObj("compositionEngine", ["compose"]);

      rootModel = {};
      composePromise = new Promise((resolve, error) => { resolve(rootModel)});

      mockContainer.get.and.returnValue(mockCompositionEngine);
      mockCompositionEngine.compose.and.returnValue(composePromise);

      aurelia = new Aurelia(mockLoader, mockContainer);

    });

    afterEach(() => delete document.body.aurelia);

    //This needs to be reworded
    it("should default the host to the document body if the supplied applicationHost is a string and no element has that id", (done) => {
      var documentSpy = spyOn(document, "getElementById").and.callThrough();
      aurelia.setRoot(rootModel, "someIDThatShouldNotExist")
        .then(() => {
          expect(aurelia.host).toBe(document.body);
          expect(document.body.aurelia).toBe(aurelia);
          expect(documentSpy).toHaveBeenCalledWith("someIDThatShouldNotExist");
          expect(mockContainer.registerInstance).toHaveBeenCalledWith(Element, document.body);
        })
        .catch((reason) => expect(false).toBeTruthy(reason))
        .then(done);
    });

    it("should try and find the element with an id of applicationHost if one is not supplied", (done) => {
      var documentSpy = spyOn(document, "getElementById").and.callThrough();
      aurelia.setRoot(rootModel)
        .then(() => {
          expect(aurelia.host).toBe(document.body);
          expect(document.body.aurelia).toBe(aurelia);
          expect(documentSpy).toHaveBeenCalledWith("applicationHost");
          expect(mockContainer.registerInstance).toHaveBeenCalledWith(Element, document.body);
        })
        .catch((reason) => expect(false).toBeTruthy(reason))
        .then(done);
    });

    it("should use the applicationHost if it's not a string as the host", (done) => {
      //This wouldn't have succeeded because registerInstance checks the type
      //But the function doesn't guard against applicationHost so this test is valid
      var host = {};
      aurelia.setRoot(rootModel, host)
        .then(() => {
          expect(aurelia.host).toBe(host);
          expect(host.aurelia).toBe(aurelia);
          expect(mockContainer.registerInstance).toHaveBeenCalledWith(Element, host);
        })
        .catch((reason) => expect(false).toBeTruthy(reason))
        .then(done);
    });

    it("should call the compose function of the composition instance with a well formed instruction", (done) => {
      let attachedSpy;
      mockCompositionEngine.compose.and.callFake((instruction) => {
        attachedSpy = spyOn(instruction.viewSlot,'attached');
        return composePromise;
      });

      aurelia.setRoot(rootModel)
        .then(() => {
          expect(mockCompositionEngine.compose).toHaveBeenCalled();
          let instruction = mockCompositionEngine.compose.calls.mostRecent().args[0];
          expect(instruction.viewModel).toBe(rootModel);
          expect(instruction.container).toBe(mockContainer);
          expect(instruction.childContainer).toBe(mockContainer);
          expect(instruction.viewSlot).toEqual(jasmine.any(ViewSlot));
        })
        .catch((reason) => expect(false).toBeTruthy(reason))
        .then(done);
    });
  });
});
