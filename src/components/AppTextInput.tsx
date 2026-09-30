/**
 * App-wide TextInput: Return/Done dismisses the keyboard on single-line fields.
 * Multiline fields keep Return as a newline (unchanged).
 */

import React from 'react';
import { Keyboard } from 'react-native';
import { TextInput, type TextInputProps } from 'react-native-paper';

export type AppTextInputProps = TextInputProps;

const AppTextInput = React.forwardRef<any, AppTextInputProps>(
  function AppTextInput(
    {
      multiline,
      blurOnSubmit,
      returnKeyType,
      onSubmitEditing,
      ...rest
    },
    ref,
  ) {
    const isMultiline = !!multiline;
    const resolvedReturnKey =
      returnKeyType ?? (isMultiline ? 'default' : 'done');
    const isNext = resolvedReturnKey === 'next';

    return (
      <TextInput
        ref={ref}
        multiline={multiline}
        blurOnSubmit={blurOnSubmit ?? (!isMultiline && !isNext)}
        returnKeyType={resolvedReturnKey}
        onSubmitEditing={(e) => {
          onSubmitEditing?.(e);
          if (!isMultiline && !isNext) {
            Keyboard.dismiss();
          }
        }}
        {...rest}
      />
    );
  },
) as React.ForwardRefExoticComponent<
  AppTextInputProps & React.RefAttributes<any>
> & {
  Icon: typeof TextInput.Icon;
  Affix: typeof TextInput.Affix;
};

AppTextInput.Icon = TextInput.Icon;
AppTextInput.Affix = TextInput.Affix;

export default AppTextInput;
