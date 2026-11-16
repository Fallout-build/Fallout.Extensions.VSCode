// Fixture for goToTarget tests. Not compiled.
// Declares a same-named target on a component interface, so `declaredIn` has to pick.
interface ICompile
{
    Target Compile => _ => _
        .Executes(() => { });
}
