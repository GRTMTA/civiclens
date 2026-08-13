import {describe,it,expect} from 'vitest'; import {rankProjects} from './matching.js';
describe('project matching',()=>it('ranks nearby matching infrastructure',()=>{const p:any={id:'1',name:'Road repair',description:'road',category:'road',coordinates:{latitude:10,longitude:123}}; expect(rankProjects([p],{latitude:10,longitude:123},'road',[])[0].confidence).toBeGreaterThan(.8);}));
