import PostNodeBuilder from 'mobiledoc-kit/models/post-node-builder';
import SectionParser from 'mobiledoc-kit/parsers/section';
import Helpers from '../../test-helpers';
import {
  NODE_TYPES
} from 'mobiledoc-kit/utils/dom-utils';

const {module, test} = Helpers;

let builder, parser;
let buildDOM = Helpers.dom.fromHTML;

module('Unit: Parser: SectionParser', {
  beforeEach() {
    builder = new PostNodeBuilder();
    parser = new SectionParser(builder);
  },
  afterEach() {
    builder = null;
    parser = null;
  }
});

test('#parse parses simple dom', (assert) => {
  let container = buildDOM('<p>hello there<b>i am bold</b><p>');
  let element = container.firstChild;

  const [section] = parser.parse(element);
  assert.equal(section.tagName, 'p');
  assert.equal(section.markers.length, 2, 'has 2 markers');
  const [m1, m2] = section.markers.toArray();

  assert.equal(m1.value, 'hello there');
  assert.equal(m2.value, 'i am bold');
  assert.ok(m2.hasMarkup('b'), 'm2 is bold');
});

test('#parse parses nested markups', (assert) => {
  let container = buildDOM(`
    <p><b>i am bold<i>i am bold and italic</i>i am bold again</b></p>
  `);
  let element = container.firstChild;

  const [section] = parser.parse(element);
  assert.equal(section.markers.length, 3, 'has 3 markers');
  const [m1, m2, m3] = section.markers.toArray();

  assert.equal(m1.value, 'i am bold');
  assert.equal(m2.value, 'i am bold and italic');
  assert.equal(m3.value, 'i am bold again');
  assert.ok(m1.hasMarkup('b'), 'm1 is bold');
  assert.ok(m2.hasMarkup('b') && m2.hasMarkup('i'), 'm2 is bold and i');
  assert.ok(m3.hasMarkup('b'), 'm3 is bold');
  assert.ok(!m1.hasMarkup('i') && !m3.hasMarkup('i'), 'm1 and m3 are not i');
});

test('#parse ignores non-markup elements like spans', (assert) => {
  let container = buildDOM(`
    <p><span>i was in span</span></p>
  `);
  let element = container.firstChild;

  const [section] = parser.parse(element);
  assert.equal(section.tagName, 'p');
  assert.equal(section.markers.length, 1, 'has 1 markers');
  const [m1] = section.markers.toArray();

  assert.equal(m1.value, 'i was in span');
});

test('#parse reads attributes', (assert) => {
  let container = buildDOM(`
    <p><a href="google.com">i am a link</a></p>
  `);
  let element = container.firstChild;

  const [section] = parser.parse(element);
  assert.equal(section.markers.length, 1, 'has 1 markers');
  const [m1] = section.markers.toArray();
  assert.equal(m1.value, 'i am a link');
  assert.ok(m1.hasMarkup('a'), 'has "a" markup');
  assert.equal(m1.getMarkup('a').attributes.href, 'google.com');
});

test('#parse joins contiguous text nodes separated by non-markup elements', (assert) => {
  let container = buildDOM(`
    <p><span>span 1</span><span>span 2</span></p>
  `);
  let element = container.firstChild;

  const [section] = parser.parse(element);
  assert.equal(section.tagName, 'p');
  assert.equal(section.markers.length, 1, 'has 1 marker');
  const [m1] = section.markers.toArray();

  assert.equal(m1.value, 'span 1span 2');
});

test('#parse turns a textNode into a section', (assert) => {
  let container = buildDOM(`I am a text node`);
  let element = container.firstChild;
  const [section] = parser.parse(element);
  assert.equal(section.tagName, 'p');
  assert.equal(section.markers.length, 1, 'has 1 marker');
  const [m1] = section.markers.toArray();

  assert.equal(m1.value, 'I am a text node');
});

test('#parse allows passing in parserPlugins that can override element parsing', (assert) => {
  let container = buildDOM(`
    <p>text 1<img src="https://placehold.it/100x100">text 2</p>
  `);

  let element = container.firstChild;
  let plugins = [function(element, builder, {addSection}) {
    if (element.tagName !== 'IMG') {
      return;
    }
    let payload = {url: element.src};
    let cardSection = builder.createCardSection('test-image', payload);
    addSection(cardSection);
  }];
  parser = new SectionParser(builder, {plugins});
  const sections = parser.parse(element);

  assert.equal(sections.length, 3, '3 sections');

  assert.equal(sections[0].text, 'text 1');
  assert.equal(sections[2].text, 'text 2');

  let cardSection = sections[1];
  assert.equal(cardSection.name, 'test-image');
  assert.deepEqual(cardSection.payload, {url: 'https://placehold.it/100x100'});
});

test('#parse allows passing in parserPlugins that can override text parsing', (assert) => {
  let container = buildDOM(`
    <p>text 1<img src="https://placehold.it/100x100">text 2</p>
  `);

  let element = container.firstChild;
  let plugins = [function(element, builder, {addMarkerable, nodeFinished}) {
    if (element.nodeType === NODE_TYPES.TEXT) {
      if (element.textContent === 'text 1') {
        addMarkerable(builder.createMarker('oh my'));
      }
      nodeFinished();
    }
  }];
  parser = new SectionParser(builder, {plugins});
  const sections = parser.parse(element);

  assert.equal(sections.length, 1, '1 section');
  assert.equal(sections[0].text, 'oh my');
});

test('#parse only runs text nodes through parserPlugins once', (assert) => {
  let container = buildDOM('text');
  let textNode = container.firstChild;

  assert.equal(textNode.nodeType, NODE_TYPES.TEXT);

  let pluginRunCount = 0;
  let plugins = [function (element) {
    if (element.nodeType === NODE_TYPES.TEXT && element.textContent === 'text') {
      pluginRunCount++;
    }
  }];
  parser = new SectionParser(builder, {plugins});
  parser.parse(textNode);

  assert.equal(pluginRunCount, 1);
});

test("#parse handles single paragraph in list item", assert => {
  let container = buildDOM(`
    <ul><li><p>One</p></li>
  `);

  let element = container.firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 1, "single list section");

  let list = sections[0];
  assert.equal(list.type, "list-section");
  assert.equal(list.items.length, 1, "1 list item");
  assert.equal(list.items.objectAt(0).text, "One");
});

test("#parse handles multiple paragraphs in list item", assert => {
  let container = buildDOM(`
    <ul><li><p>One</p><p>Two</p></li>
  `);

  let element = container.firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 1, "single list section");

  let list = sections[0];
  assert.equal(list.type, "list-section");
  assert.equal(list.items.length, 1, "1 list item");
  assert.equal(list.items.objectAt(0).text, "OneTwo");
});

test("#parse handles multiple headers in list item", assert => {
  let container = buildDOM(`
    <ul><li><h1>One</h1><h2>Two</h2></li>
  `);

  let element = container.firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 1, "single list section");

  let list = sections[0];
  assert.equal(list.type, "list-section");
  assert.equal(list.items.length, 1, "1 list item");
  assert.equal(list.items.objectAt(0).text, "OneTwo");
});

// see https://github.com/bustle/mobiledoc-kit/issues/656
test('#parse handles list following node handled by parserPlugin', (assert) => {
  let container = buildDOM(`
    <div><img src="https://placehold.it/100x100"><ul><li>LI One</li></ul></div>
  `);

  let element = container.firstChild;
  let plugins = [function(element, builder, {addSection, nodeFinished}) {
    if (element.tagName !== 'IMG') {
      return;
    }
    let payload = {url: element.src};
    let cardSection = builder.createCardSection('test-image', payload);
    addSection(cardSection);
    nodeFinished();
  }];

  parser = new SectionParser(builder, { plugins });
  const sections = parser.parse(element);

  assert.equal(sections.length, 2, '2 sections');

  let cardSection = sections[0];
  assert.equal(cardSection.name, 'test-image');
  assert.deepEqual(cardSection.payload, {url: 'https://placehold.it/100x100'});

  let listSection = sections[1];
  assert.equal(listSection.type, 'list-section');
  assert.equal(listSection.items.length, 1, '1 list item');
});

test('#parse avoids empty paragraph around wrapped list', (assert) => {
  let container = buildDOM(`
    <div><ul><li>One</li></ul></div>
  `);

  let element = container.firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 1, 'single list section');
});

test('#parse skips STYLE nodes', (assert) => {
  let element = buildDOM(`
    <style>.rule { font-color: red; }</style>
  `).firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 0, 'does not parse style');
});

test('#parse skips top-level Comment nodes', (assert) => {
  let element = buildDOM(`
    <!--Some comment-->
  `).firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 0, 'does not parse comments');
});

test('#parse skips nested Comment nodes', (assert) => {
  let element = buildDOM(`
   <p><!--Some comment-->some text<!-- another comment --></p>
  `).firstChild;
  parser = new SectionParser(builder);
  let sections = parser.parse(element);

  assert.equal(sections.length, 1);
  let section = sections[0];
  assert.equal(section.text, 'some text', 'parses text surrounded by comments');
  assert.equal(section.markers.length, 1, 'only 1 marker');
});
