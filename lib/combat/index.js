'use strict';

const timings = require('./timings');
const context = require('./context');
const effects = require('./effects');
const matcher = require('./matcher');
const reactions = require('./reactions');
const pipeline = require('./pipeline');
const enrich = require('./enrich-skills');
const skillResolve = require('./skill-resolve');
const engine = require('./engine');
const monitors = require('./monitors');
const statusCatalog = require('./status-catalog');
const statusTick = require('./status-tick');
const statMods = require('./stat-mods');
const targetResolve = require('./target-resolve');
const timingBus = require('./timing-bus');
const skillRunner = require('./skill-runner');
const charge = require('./charge');
const grit = require('./grit');
const skillRegistry = require('./skill-registry');
const skillRules = require('./skill-rules');
const resources = require('./resources');
const worldGeometry = require('./world-geometry');
const compilePipeline = require('./compile-pipeline');
const damage = require('./damage');
const modules = require('./modules');
require('./register-actives');

module.exports = {
    ...timings,
    ...context,
    ...effects,
    ...matcher,
    ...reactions,
    ...pipeline,
    ...enrich,
    ...skillResolve,
    ...compilePipeline,
    ...damage,
    ...modules,
    ...engine,
    ...monitors,
    ...statusCatalog,
    ...statusTick,
    ...statMods,
    ...targetResolve,
    ...timingBus,
    ...skillRunner,
    ...charge,
    ...grit,
    ...skillRegistry,
    ...skillRules,
    ...resources,
    ...worldGeometry,
    ...require('./host-ops'),
    ...require('./pick-catalog'),
    ...require('./skill-params')
};
