// Fixture for goToTarget tests. Not compiled.
class Build
{
    Target Clean => _ => _
        .Executes(() => { });

    Target Restore => _ => _
        .After(Clean);

    Target Compile => _ => _
        .DependsOn(Restore);

    Target Pack => _ => _
        .TriggeredBy(Compile);
}
