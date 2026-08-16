# Assembly profiles (Phase 2 pilot)

The fallow `assembly` zone only allows imports from `backend-core`,
`contracts`, and `lib`. Because `localAgentAssembly`/`teamMonolithAssembly` must
wire host-local nodes AND the seven `service-*` node descriptors, those
concrete builders **live in host-local** at
`packages/host-local/src/nest/runtime/assembly/profiles/` (the host-local zone
may import both assembly and the service packages).

This directory hosts the assembly-zone-legal composition primitive
(`composeEmbeddedPilot`) that the host-local profiles call, so the validated
composition path is single-sourced in the assembly kernel. The placement is a
documented Phase 2 deviation required by the zone boundaries (see the Phase 2
report). No judgement-node / D8 items are included.
