import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The modules each module may import, each through its surface. A folder
/// directly under `lib/` is a module, and so is a file there, by its name.
const Map<String, Set<String>> _moduleEdges = {
  'bridge': {},
  'design': {},
  'feedback': {},
  'cleaner': {'bridge'},
  'update': {'bridge'},
  'bridge_process': {'bridge', 'cleaner', 'update'},
  'link': {'bridge', 'design'},
  'link_process': {'bridge', 'link'},
  'scan_view': {'bridge', 'cleaner', 'design'},
  'overview': {'bridge', 'cleaner', 'design', 'link', 'scan_view', 'update'},
  'section': {'bridge', 'cleaner', 'design', 'link', 'scan_view'},
  'removal': {'bridge', 'cleaner', 'design', 'feedback', 'link', 'scan_view'},
  'settings': {'cleaner', 'design', 'update'},
  'shell': {
    'bridge',
    'cleaner',
    'design',
    'link',
    'overview',
    'removal',
    'scan_view',
    'section',
    'settings',
    'update',
  },
  'main.dart': {
    'bridge_process',
    'cleaner',
    'design',
    'link',
    'link_process',
    'shell',
    'update',
  },
};

const String _packagePrefix = 'package:magic_free_disk_space/';

final RegExp _directivePattern = RegExp(
  r'''^\s*(?:import|export)\s+['"]([^'"]+)['"]''',
  multiLine: true,
);

/// The module a path under `lib/` belongs to: its first folder, or the file
/// itself when it lies in `lib/`.
String readModule(String libPath) {
  final int slashIndex = libPath.indexOf('/');
  return slashIndex == -1 ? libPath : libPath.substring(0, slashIndex);
}

/// The path under `lib/` that [uri], written in the file at [libPath],
/// names, or `null` for a uri outside the app.
String? resolveLibPath(String uri, {required String libPath}) {
  if (uri.startsWith(_packagePrefix)) {
    return uri.substring(_packagePrefix.length);
  }
  if (uri.startsWith('package:') || uri.startsWith('dart:')) {
    return null;
  }
  return Uri(path: libPath).resolve(uri).path;
}

/// The path under `lib/` of the file at [fileUri], a uri relative to the app,
/// joined with `/` on every platform.
String toLibPath(Uri fileUri) {
  // The segments of a file uri hold no separator of the platform, such as the `\` of Windows.
  return fileUri.pathSegments.skip(1).join('/');
}

/// The paths under `lib/` of every Dart file there.
List<String> listLibPaths() {
  final Directory libDirectory = Directory('lib');
  return [
    for (final FileSystemEntity entity in libDirectory.listSync(recursive: true))
      if (entity is File && entity.path.endsWith('.dart')) toLibPath(entity.uri),
  ]..sort();
}

/// The modules of [edges] along a cycle, the first repeated at its end, or
/// `null` when the edges hold none.
List<String>? findCycle(Map<String, Set<String>> edges) {
  final Set<String> finished = {};
  final List<String> trail = [];

  List<String>? visit(String module) {
    final int trailIndex = trail.indexOf(module);
    if (trailIndex != -1) {
      return [...trail.sublist(trailIndex), module];
    }
    if (finished.contains(module)) {
      return null;
    }
    trail.add(module);
    for (final String target in edges[module] ?? const <String>{}) {
      final List<String>? cycle = visit(target);
      if (cycle != null) {
        return cycle;
      }
    }
    trail.removeLast();
    finished.add(module);
    return null;
  }

  for (final String module in edges.keys) {
    final List<String>? cycle = visit(module);
    if (cycle != null) {
      return cycle;
    }
  }
  return null;
}

/// Each import and export of [source], a file at [libPath], that crosses a
/// module along an edge [edges] lacks or past the surface of its target.
List<String> findDirectiveViolations(
  String source, {
  required String libPath,
  required Map<String, Set<String>> edges,
}) {
  final String module = readModule(libPath);
  final Set<String> allowedTargets = edges[module] ?? const <String>{};
  final List<String> violations = [];
  for (final RegExpMatch match in _directivePattern.allMatches(source)) {
    final String uri = match.group(1) ?? '';
    final String? targetPath = resolveLibPath(uri, libPath: libPath);
    if (targetPath == null) {
      continue;
    }
    final String targetModule = readModule(targetPath);
    if (targetModule == module) {
      continue;
    }
    if (!allowedTargets.contains(targetModule)) {
      violations.add('$libPath: $module -> $targetModule is no edge of the table ($uri)');
    }
    if (targetPath != '$targetModule/$targetModule.dart') {
      violations.add(
        '$libPath: $module -> $targetModule passes its surface $targetModule/$targetModule.dart ($uri)',
      );
    }
  }
  return violations;
}

void main() {
  test('the table of the modules holds no cycle', () {
    expect(findCycle(_moduleEdges), isNull);
  });

  test('the table names every module of lib/, and no other', () {
    final Set<String> modules = {for (final String libPath in listLibPaths()) readModule(libPath)};
    expect(
      modules.difference(_moduleEdges.keys.toSet()),
      isEmpty,
      reason: 'a module of lib/ is missing from the table',
    );
    expect(
      _moduleEdges.keys.toSet().difference(modules),
      isEmpty,
      reason: 'the table names a module lib/ does not hold',
    );
  });

  test('each module folder has its surface', () {
    final List<String> libPaths = listLibPaths();
    final List<String> missing = [
      for (final String module in _moduleEdges.keys)
        if (!module.endsWith('.dart') && !libPaths.contains('$module/$module.dart'))
          '$module/$module.dart',
    ];
    expect(missing, isEmpty);
  });

  test('each import and export of lib/ follows the table through a surface', () {
    final List<String> violations = [
      for (final String libPath in listLibPaths())
        ...findDirectiveViolations(
          File('lib/$libPath').readAsStringSync(),
          libPath: libPath,
          edges: _moduleEdges,
        ),
    ];
    expect(violations, isEmpty);
  });

  group('the check itself', () {
    const Map<String, Set<String>> edges = {
      'cleaner': {'bridge'},
      'bridge': {},
    };

    test('passes an import of a surface along an edge, in both forms', () {
      expect(
        findDirectiveViolations(
          "import '../bridge/bridge.dart';\n"
          "import 'package:magic_free_disk_space/bridge/bridge.dart';\n"
          "import 'cleaner_bridge.dart';\n"
          "import 'package:flutter/widgets.dart';\n",
          libPath: 'cleaner/cleaner_controller.dart',
          edges: edges,
        ),
        isEmpty,
      );
    });

    test('fails an import past a surface, in both forms', () {
      expect(
        findDirectiveViolations(
          "import '../bridge/bridge_event.dart';\n"
          "export 'package:magic_free_disk_space/bridge/bridge_event.dart';\n",
          libPath: 'cleaner/cleaner_controller.dart',
          edges: edges,
        ),
        hasLength(2),
      );
    });

    test('fails an edge the table lacks', () {
      expect(
        findDirectiveViolations(
          "import '../cleaner/cleaner.dart';\n",
          libPath: 'bridge/bridge_event.dart',
          edges: edges,
        ),
        [contains('bridge -> cleaner is no edge')],
      );
    });

    test('reads a path under lib/ with `/`, from a uri of Windows too', () {
      expect(
        toLibPath(Uri.file(r'lib\design\disk_ring\disk_ring.dart', windows: true)),
        'design/disk_ring/disk_ring.dart',
      );
      expect(
        toLibPath(Uri.file('lib/design/disk_ring/disk_ring.dart', windows: false)),
        'design/disk_ring/disk_ring.dart',
      );
    });

    test('finds a cycle with the modules along it', () {
      expect(
        findCycle(const {
          'bridge': {'cleaner'},
          'cleaner': {'update'},
          'update': {'cleaner'},
        }),
        ['cleaner', 'update', 'cleaner'],
      );
    });
  });
}
